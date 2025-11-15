"""
Advanced training script with cutting-edge techniques for winning the hackathon!
Includes: Mixup, CutMix, SpecAugment++, Advanced schedulers, and more.
"""
import torch
import torch.nn as nn
import torch.optim as optim
import torchaudio
import torchaudio.transforms as T
from torch.utils.data import Dataset, DataLoader
import pandas as pd
from pathlib import Path
import modal
import numpy as np
import random
from tqdm import tqdm


# Advanced augmentation techniques
class Mixup:
    """Mixup augmentation for better generalization"""
    def __init__(self, alpha=1.0):
        self.alpha = alpha
    
    def __call__(self, x, y):
        batch_size = x.size(0)
        if self.alpha > 0:
            lam = np.random.beta(self.alpha, self.alpha)
        else:
            lam = 1
        
        index = torch.randperm(batch_size).to(x.device)
        mixed_x = lam * x + (1 - lam) * x[index]
        y_a, y_b = y, y[index]
        
        return mixed_x, y_a, y_b, lam


class CutMix:
    """CutMix augmentation - cuts and mixes spectrograms"""
    def __init__(self, alpha=1.0):
        self.alpha = alpha
    
    def __call__(self, x, y):
        batch_size = x.size(0)
        lam = np.random.beta(self.alpha, self.alpha)
        
        index = torch.randperm(batch_size).to(x.device)
        
        # Get random box
        W = x.size(2)
        H = x.size(3)
        cut_rat = np.sqrt(1. - lam)
        cut_w = int(W * cut_rat)
        cut_h = int(H * cut_rat)
        
        cx = np.random.randint(W)
        cy = np.random.randint(H)
        
        bbx1 = np.clip(cx - cut_w // 2, 0, W)
        bby1 = np.clip(cy - cut_h // 2, 0, H)
        bbx2 = np.clip(cx + cut_w // 2, 0, W)
        bby2 = np.clip(cy + cut_h // 2, 0, H)
        
        # Apply CutMix
        mixed_x = x.clone()
        mixed_x[:, :, bbx1:bbx2, bby1:bby2] = x[index, :, bbx1:bbx2, bby1:bby2]
        
        # Adjust lambda based on actual box area
        lam = 1 - ((bbx2 - bbx1) * (bby2 - bby1) / (W * H))
        y_a, y_b = y, y[index]
        
        return mixed_x, y_a, y_b, lam


class SpecAugmentPlus(nn.Module):
    """Enhanced SpecAugment with additional techniques"""
    def __init__(self):
        super().__init__()
        self.freq_mask = T.FrequencyMasking(freq_mask_param=20)
        self.time_mask = T.TimeMasking(time_mask_param=50)
        
    def forward(self, x):
        # Apply multiple masks
        x = self.freq_mask(x)
        x = self.time_mask(x)
        
        # Random gain
        if random.random() < 0.3:
            gain = torch.FloatTensor(1).uniform_(0.7, 1.3)
            x = x * gain
        
        # Random noise
        if random.random() < 0.3:
            noise = torch.randn_like(x) * 0.01
            x = x + noise
        
        return x


class DroneAudioDataset(Dataset):
    """Enhanced dataset with advanced preprocessing"""
    def __init__(self, data_dir, metadata_file, split="train", transform=None, augment=True):
        super().__init__()
        self.data_dir = Path(data_dir)
        full_metadata = pd.read_csv(metadata_file)
        self.split = split
        self.transform = transform
        self.augment = augment and split == "train"
        
        # Compute classes from FULL dataset
        self.classes = sorted(full_metadata['category'].unique())
        self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
        
        # Split data
        if split == 'train':
            self.metadata = full_metadata[full_metadata['fold'] != 5].copy()
        else:
            self.metadata = full_metadata[full_metadata['fold'] == 5].copy()
        
        self.metadata['label'] = self.metadata['category'].map(self.class_to_idx)
        
        # Validate
        if self.metadata['label'].isna().any():
            invalid_cats = self.metadata[self.metadata['label'].isna()]['category'].unique()
            raise ValueError(f"Found unmapped categories in {split} set: {invalid_cats}")
        
        print(f"✅ {split.capitalize()} dataset: {len(self.metadata)} samples, {len(self.classes)} classes")
        
        # Additional augmentation
        self.spec_augment = SpecAugmentPlus() if self.augment else None

    def __len__(self):
        return len(self.metadata)

    def __getitem__(self, idx):
        row = self.metadata.iloc[idx]
        audio_path = self.data_dir / "audio" / row['filename']
        
        label = int(row['label'])
        if label < 0 or label >= len(self.classes):
            raise ValueError(f"Invalid label {label}")

        waveform, sample_rate = torchaudio.load(audio_path, backend="soundfile")

        # Convert to mono
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        # Time-domain augmentation
        if self.augment:
            # Random speed change
            if random.random() < 0.3:
                speed_factor = random.uniform(0.9, 1.1)
                waveform = torchaudio.functional.resample(
                    waveform, sample_rate, int(sample_rate * speed_factor)
                )
                waveform = torchaudio.functional.resample(
                    waveform, int(sample_rate * speed_factor), sample_rate
                )
            
            # Random pitch shift
            if random.random() < 0.3:
                n_steps = random.randint(-2, 2)
                if n_steps != 0:
                    waveform = torchaudio.functional.pitch_shift(
                        waveform, sample_rate, n_steps
                    )

        # Fixed-length preprocessing
        target_length = 110250  # 5 seconds at 22050 Hz
        current_length = waveform.shape[1]
        
        if current_length > target_length:
            # Random crop during training, center crop during validation
            if self.augment:
                start_idx = random.randint(0, current_length - target_length)
            else:
                start_idx = (current_length - target_length) // 2
            waveform = waveform[:, start_idx:start_idx + target_length]
        elif current_length < target_length:
            pad_length = target_length - current_length
            waveform = torch.nn.functional.pad(waveform, (0, pad_length), mode='constant', value=0)

        # Apply mel-spectrogram transform
        if self.transform:
            spectrogram = self.transform(waveform)
        else:
            spectrogram = waveform

        # Apply SpecAugment++
        if self.spec_augment:
            spectrogram = self.spec_augment(spectrogram)

        # Handle NaN and inf
        spectrogram = torch.nan_to_num(spectrogram, nan=0.0, posinf=0.0, neginf=-80.0)
        spectrogram = torch.clamp(spectrogram, min=-80.0, max=0.0)

        return spectrogram, label


# Modal setup
app = modal.App("drone-audio-advanced-training")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .apt_install(["libsndfile1", "ffmpeg"])
    .add_local_python_source("model")
)

volume = modal.Volume.from_name("esc-dataset", create_if_missing=True)
model_volume = modal.Volume.from_name("esc-model", create_if_missing=True)


@app.function(
    image=image,
    gpu=modal.gpu.A100(count=1),  # Use A100 for faster training
    volumes={
        "/data": volume,
        "/models": model_volume
    },
    timeout=7200,
    _allow_background_volume_commits=True
)
def train_advanced():
    import os
    os.environ['CUDA_LAUNCH_BLOCKING'] = '1'
    
    from model import AudioCNN
    
    print("🚀 Advanced Training for Hackathon Victory!")
    print("=" * 50)
    
    # Check CUDA
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")
    if device.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    # Advanced transforms
    train_transform = nn.Sequential(
        T.MelSpectrogram(
            sample_rate=22050,
            n_fft=2048,
            hop_length=256,
            n_mels=256,
            f_min=80,
            f_max=8000
        ),
        T.AmplitudeToDB()
    )
    
    val_transform = nn.Sequential(
        T.MelSpectrogram(
            sample_rate=22050,
            n_fft=2048,
            hop_length=256,
            n_mels=256,
            f_min=80,
            f_max=8000
        ),
        T.AmplitudeToDB()
    )
    
    # Datasets
    train_dataset = DroneAudioDataset(
        data_dir="/data/ESC-50-master",
        metadata_file="/data/ESC-50-master/meta/esc50.csv",
        split="train",
        transform=train_transform,
        augment=True
    )
    
    val_dataset = DroneAudioDataset(
        data_dir="/data/ESC-50-master",
        metadata_file="/data/ESC-50-master/meta/esc50.csv",
        split="test",
        transform=val_transform,
        augment=False
    )
    
    # DataLoaders with optimized settings
    train_loader = DataLoader(
        train_dataset, 
        batch_size=32,  # Larger batch for A100
        shuffle=True,
        num_workers=4,
        pin_memory=True,
        persistent_workers=True
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=64,
        shuffle=False,
        num_workers=4,
        pin_memory=True,
        persistent_workers=True
    )
    
    # Model with enhanced architecture
    model = AudioCNN(num_classes=len(train_dataset.classes), dropout_rate=0.5)
    model = model.to(device)
    
    # Advanced optimizer and criterion
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    optimizer = optim.AdamW(
        model.parameters(),
        lr=0.001,
        weight_decay=0.01,
        betas=(0.9, 0.999)
    )
    
    # Cosine annealing with warm restarts
    scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer,
        T_0=10,
        T_mult=2,
        eta_min=1e-6
    )
    
    # Initialize augmentation
    mixup = Mixup(alpha=0.4)
    cutmix = CutMix(alpha=1.0)
    
    # Training settings
    num_epochs = 100
    best_val_acc = 0
    patience = 20
    patience_counter = 0
    
    # Training history
    history = {
        'train_loss': [], 'train_acc': [],
        'val_loss': [], 'val_acc': []
    }
    
    print(f"\n📊 Training Configuration:")
    print(f"   - Model: Enhanced AudioCNN with Attention")
    print(f"   - Epochs: {num_epochs}")
    print(f"   - Batch Size: 32")
    print(f"   - Learning Rate: 0.001 (CosineAnnealingWarmRestarts)")
    print(f"   - Augmentation: Mixup, CutMix, SpecAugment++")
    print(f"   - Classes: {train_dataset.classes}")
    
    for epoch in range(num_epochs):
        # Training phase
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        pbar = tqdm(train_loader, desc=f'Epoch {epoch+1}/{num_epochs}')
        for batch_idx, (inputs, targets) in enumerate(pbar):
            inputs, targets = inputs.to(device), targets.to(device)
            
            # Apply Mixup or CutMix
            r = random.random()
            if r < 0.3:
                inputs, targets_a, targets_b, lam = mixup(inputs, targets)
            elif r < 0.6:
                inputs, targets_a, targets_b, lam = cutmix(inputs, targets)
            else:
                targets_a = targets_b = targets
                lam = 1.0
            
            optimizer.zero_grad()
            outputs = model(inputs)
            
            # Mixed loss
            loss = lam * criterion(outputs, targets_a) + (1 - lam) * criterion(outputs, targets_b)
            
            loss.backward()
            
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = outputs.max(1)
            train_total += targets.size(0)
            train_correct += (lam * predicted.eq(targets_a).sum().item() + 
                            (1 - lam) * predicted.eq(targets_b).sum().item())
            
            pbar.set_postfix({
                'loss': f'{loss.item():.4f}',
                'acc': f'{100.*train_correct/train_total:.2f}%',
                'lr': f'{scheduler.get_last_lr()[0]:.6f}'
            })
        
        # Validation phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, targets)
                
                val_loss += loss.item()
                _, predicted = outputs.max(1)
                val_total += targets.size(0)
                val_correct += predicted.eq(targets).sum().item()
        
        # Calculate metrics
        train_acc = 100. * train_correct / train_total
        val_acc = 100. * val_correct / val_total
        avg_train_loss = train_loss / len(train_loader)
        avg_val_loss = val_loss / len(val_loader)
        
        # Update history
        history['train_loss'].append(avg_train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(avg_val_loss)
        history['val_acc'].append(val_acc)
        
        print(f'\n📈 Epoch {epoch+1}/{num_epochs}:')
        print(f'   Train Loss: {avg_train_loss:.4f}, Train Acc: {train_acc:.2f}%')
        print(f'   Val Loss: {avg_val_loss:.4f}, Val Acc: {val_acc:.2f}%')
        
        # Learning rate scheduling
        scheduler.step()
        
        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            
            checkpoint = {
                'epoch': epoch + 1,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'scheduler_state_dict': scheduler.state_dict(),
                'accuracy': val_acc,
                'classes': train_dataset.classes,
                'history': history
            }
            
            torch.save(checkpoint, '/models/best_model_advanced.pth')
            model_volume.commit()
            print(f'   ✅ New best model saved! (Accuracy: {val_acc:.2f}%)')
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f'\n⚠️  Early stopping triggered after {epoch+1} epochs')
                break
    
    print(f'\n🏆 Training Complete!')
    print(f'   Best Validation Accuracy: {best_val_acc:.2f}%')
    
    # Save final model
    final_checkpoint = {
        'model_state_dict': model.state_dict(),
        'accuracy': val_acc,
        'classes': train_dataset.classes,
        'history': history
    }
    torch.save(final_checkpoint, '/models/final_model_advanced.pth')
    model_volume.commit()
    
    return {
        'best_accuracy': best_val_acc,
        'final_accuracy': val_acc,
        'history': history
    }


@app.local_entrypoint()
def main():
    print("🎯 Starting Advanced Training for Hackathon Victory!")
    results = train_advanced.remote()
    print(f"\n✨ Training completed!")
    print(f"   Best accuracy: {results['best_accuracy']:.2f}%")
    print(f"   Final accuracy: {results['final_accuracy']:.2f}%")
    print("\n🚀 Model saved to Modal volume. Ready to win!")
