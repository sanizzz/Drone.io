from pathlib import Path
import pandas as pd
import numpy as np
import modal
import torch
from torch.utils.data import Dataset, DataLoader
import torchaudio
import torch.nn as nn
import torchaudio.transforms as T
import torch.optim as optim
from torch.optim.lr_scheduler import OneCycleLR
from tqdm import tqdm

from model import AudioCNN

app = modal.App("binary-classifier-training")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .apt_install(["libsndfile1", "ffmpeg"])
    .add_local_python_source("model")
)

volume = modal.Volume.from_name("esc-dataset", create_if_missing=True)
model_volume = modal.Volume.from_name("esc-model", create_if_missing=True)


class BinaryAudioDataset(Dataset):
    """Dataset for binary classification: drone vs not_drone"""
    def __init__(self, data_dir, metadata_file, split="train", transform=None, classes=None):
        super().__init__()
        self.data_dir = Path(data_dir)
        self.metadata = pd.read_csv(metadata_file)
        self.split = split
        self.transform = transform
        
        # Binary classification setup - always use same classes
        if classes is not None:
            self.classes = classes
        else:
            self.classes = ['not_drone', 'drone']
        
        # Filter by split
        if split == 'train':
            self.metadata = self.metadata[self.metadata['fold'] != 5]
        else:
            self.metadata = self.metadata[self.metadata['fold'] == 5]
        
        self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
        self.metadata['label'] = self.metadata['category'].map(self.class_to_idx)
        
        # Validate labels - remove any NaN or invalid labels
        invalid_mask = self.metadata['label'].isna()
        if invalid_mask.any():
            print(f"WARNING: Removing {invalid_mask.sum()} samples with invalid labels")
            self.metadata = self.metadata[~invalid_mask]
        
        # Ensure all labels are in valid range [0, num_classes-1]
        self.metadata['label'] = self.metadata['label'].astype(int)
        
        print(f"✅ {split.capitalize()} dataset: {len(self.metadata)} samples")
        print(f"   Drone samples: {len(self.metadata[self.metadata['category'] == 'drone'])}")
        print(f"   Non-drone samples: {len(self.metadata[self.metadata['category'] == 'not_drone'])}")
        print(f"   Label range: [{self.metadata['label'].min()}, {self.metadata['label'].max()}]")

    def __len__(self):
        return len(self.metadata)

    def __getitem__(self, idx):
        row = self.metadata.iloc[idx]
        audio_path = self.data_dir / row['filename']
        
        waveform, sample_rate = torchaudio.load(audio_path, backend="soundfile")
        
        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        
        # Fixed-length audio preprocessing (5 seconds at 22050 Hz)
        target_length = 110250
        current_length = waveform.shape[1]
        
        if current_length > target_length:
            # Crop: Take center portion
            start_idx = (current_length - target_length) // 2
            waveform = waveform[:, start_idx:start_idx + target_length]
        elif current_length < target_length:
            # Pad: Add zeros to end
            pad_length = target_length - current_length
            waveform = torch.nn.functional.pad(waveform, (0, pad_length), mode='constant', value=0)
        
        # Apply mel-spectrogram transform + augmentation
        if self.transform:
            spectrogram = self.transform(waveform)
            # Fix NaN and inf values
            spectrogram = torch.nan_to_num(spectrogram, nan=0.0, posinf=0.0, neginf=-80.0)
            spectrogram = torch.clamp(spectrogram, min=-80.0, max=0.0)
        else:
            spectrogram = waveform
        
        # Ensure label is a valid integer
        label = int(row['label'])
        
        return spectrogram, label


@app.function(
    image=image,
    gpu="A10G",
    volumes={
        "/data": volume,
        "/models": model_volume
    },
    timeout=3600
)
def train_binary():
    import os
    os.environ['CUDA_LAUNCH_BLOCKING'] = '1'
    
    print("🚀 Starting Binary Classification Training")
    print("=" * 50)
    
    # Check for binary metadata
    metadata_path = Path("/data/binary_metadata.csv")
    if not metadata_path.exists():
        raise FileNotFoundError(
            f"❌ Binary metadata not found at {metadata_path}\n"
            "Please run: python prepare_binary_dataset.py"
        )
    
    # Setup transforms
    train_transform = nn.Sequential(
        T.MelSpectrogram(
            sample_rate=22050,
            n_fft=1024,
            hop_length=512,
            n_mels=128,
            f_min=0,
            f_max=11025
        ),
        T.AmplitudeToDB(),
        T.FrequencyMasking(freq_mask_param=15),
        T.TimeMasking(time_mask_param=40)
    )
    
    val_transform = nn.Sequential(
        T.MelSpectrogram(
            sample_rate=22050,
            n_fft=1024,
            hop_length=512,
            n_mels=128,
            f_min=0,
            f_max=11025
        ),
        T.AmplitudeToDB()
    )
    
    # Create datasets
    train_dataset = BinaryAudioDataset(
        data_dir="/data",
        metadata_file=metadata_path,
        split="train",
        transform=train_transform
    )
    
    # Create validation dataset with SAME classes as training
    val_dataset = BinaryAudioDataset(
        data_dir="/data",
        metadata_file=metadata_path,
        split="test",
        transform=val_transform,
        classes=train_dataset.classes
    )
    
    # Create dataloaders
    batch_size = 32
    train_dataloader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=2,
        pin_memory=True
    )
    test_dataloader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=2,
        pin_memory=True
    )
    
    # Setup device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"✅ Using device: {device}")
    if device.type == 'cuda':
        print(f"   GPU: {torch.cuda.get_device_name(0)}")
    
    # Initialize model
    model = AudioCNN(num_classes=2)  # Binary: drone vs not_drone
    model.to(device)
    
    # Training parameters
    num_epochs = 30  # Binary classification converges faster
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    optimizer = optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)
    
    scheduler = OneCycleLR(
        optimizer,
        max_lr=0.003,
        epochs=num_epochs,
        steps_per_epoch=len(train_dataloader),
        pct_start=0.1,
        anneal_strategy='cos'
    )
    
    best_accuracy = 0.0
    patience = 10
    patience_counter = 0
    
    print(f"\n📊 Training Configuration:")
    print(f"   Epochs: {num_epochs}")
    print(f"   Batch size: {batch_size}")
    print(f"   Initial LR: {optimizer.param_groups[0]['lr']:.6f}")
    print("=" * 50)
    
    for epoch in range(num_epochs):
        # Training phase
        model.train()
        epoch_loss = 0.0
        train_correct = 0
        train_total = 0
        
        progress_bar = tqdm(train_dataloader, desc=f'Epoch {epoch+1}/{num_epochs}')
        for data, target in progress_bar:
            data, target = data.to(device), target.to(device)
            
            output = model(data)
            loss = criterion(output, target)
            
            optimizer.zero_grad()
            loss.backward()
            
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            scheduler.step()
            
            epoch_loss += loss.item()
            
            # Calculate accuracy
            _, predicted = torch.max(output.data, 1)
            train_total += target.size(0)
            train_correct += (predicted == target).sum().item()
            
            progress_bar.set_postfix({
                'Loss': f'{loss.item():.4f}',
                'Acc': f'{100.*train_correct/train_total:.2f}%'
            })
        
        avg_epoch_loss = epoch_loss / len(train_dataloader)
        train_accuracy = 100. * train_correct / train_total
        
        # Validation phase
        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0
        
        # Confusion matrix variables
        true_positives = 0
        false_positives = 0
        true_negatives = 0
        false_negatives = 0
        
        with torch.no_grad():
            for data, target in test_dataloader:
                data, target = data.to(device), target.to(device)
                outputs = model(data)
                loss = criterion(outputs, target)
                val_loss += loss.item()
                
                _, predicted = torch.max(outputs.data, 1)
                val_total += target.size(0)
                val_correct += (predicted == target).sum().item()
                
                # Calculate confusion matrix
                for i in range(target.size(0)):
                    if target[i] == 1 and predicted[i] == 1:
                        true_positives += 1
                    elif target[i] == 0 and predicted[i] == 1:
                        false_positives += 1
                    elif target[i] == 0 and predicted[i] == 0:
                        true_negatives += 1
                    elif target[i] == 1 and predicted[i] == 0:
                        false_negatives += 1
        
        accuracy = 100 * val_correct / val_total
        avg_val_loss = val_loss / len(test_dataloader)
        
        # Calculate metrics
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        print(f'\nEpoch {epoch+1}/{num_epochs}:')
        print(f'  Train Loss: {avg_epoch_loss:.4f}, Train Acc: {train_accuracy:.2f}%')
        print(f'  Val Loss: {avg_val_loss:.4f}, Val Acc: {accuracy:.2f}%')
        print(f'  Precision: {precision:.3f}, Recall: {recall:.3f}, F1: {f1_score:.3f}')
        
        # Save best model
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            patience_counter = 0
            
            checkpoint = {
                'epoch': epoch + 1,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'accuracy': accuracy,
                'precision': precision,
                'recall': recall,
                'f1_score': f1_score,
                'classes': train_dataset.classes
            }
            
            torch.save(checkpoint, '/models/binary_model.pth')
            model_volume.commit()
            print(f'  ✅ New best model saved! (Accuracy: {accuracy:.2f}%)')
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f'\n⚠️ Early stopping triggered after {epoch+1} epochs')
                break
    
    print(f'\n✅ Binary Classification Training Complete!')
    print(f'   Best Accuracy: {best_accuracy:.2f}%')
    print(f'   Model saved to: /models/binary_model.pth')
    
    return {
        'best_accuracy': best_accuracy,
        'epochs_trained': epoch + 1
    }


@app.local_entrypoint()
def main():
    print("🎯 Starting Binary Classifier Training (Drone vs Not-Drone)")
    print("=" * 50)
    results = train_binary.remote()
    print(f"\n✨ Training completed!")
    print(f"   Best accuracy: {results['best_accuracy']:.2f}%")
    print(f"   Epochs trained: {results['epochs_trained']}")