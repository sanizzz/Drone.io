"""
Train binary classifier: drone vs not_drone
"""
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

app = modal.App("audio-cnn-binary")

# Build image with both datasets
image = (modal.Image.debian_slim()
         .pip_install_from_requirements("requirements.txt")
         .apt_install(["wget", "unzip", "ffmpeg", "libsndfile1"])
         .run_commands([
             # Download drone dataset
             "cd /tmp && wget https://github.com/sanizzz/drone-audio-dataset/archive/main.zip -O drone-data.zip",
             "cd /tmp && unzip drone-data.zip",
             "mkdir -p /opt/drone-data",
             "cp -r /tmp/drone-audio-dataset-main/* /opt/drone-data/",
             "rm -rf /tmp/drone-data.zip /tmp/drone-audio-dataset-main",
             
             # Download ESC-50 dataset
             "cd /tmp && wget https://github.com/karolpiczak/ESC-50/archive/master.zip -O esc50.zip",
             "cd /tmp && unzip esc50.zip",
             "mkdir -p /opt/esc50-data",
             "cp -r /tmp/ESC-50-master/* /opt/esc50-data/",
             "rm -rf /tmp/esc50.zip /tmp/ESC-50-master"
         ])
         .add_local_python_source("model")
         .add_local_python_source("prepare_binary_dataset"))

model_volume = modal.Volume.from_name("drone-model", create_if_missing=True)


class BinaryAudioDataset(Dataset):
    """Dataset for binary classification (drone vs not_drone)"""
    def __init__(self, data_dir, metadata_file, split="train", transform=None):
        super().__init__()
        self.data_dir = Path(data_dir)
        self.metadata = pd.read_csv(metadata_file)
        self.split = split
        self.transform = transform

        if split == 'train':
            self.metadata = self.metadata[self.metadata['fold'] != 5]
        else:
            self.metadata = self.metadata[self.metadata['fold'] == 5]

        self.classes = ['not_drone', 'drone']  # 2 classes
        self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
        self.metadata['label'] = self.metadata['category'].map(self.class_to_idx)

    def __len__(self):
        return len(self.metadata)

    def __getitem__(self, idx):
        row = self.metadata.iloc[idx]
        audio_path = self.data_dir / row['filename']

        waveform, sample_rate = torchaudio.load(audio_path, backend="soundfile")

        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        if self.transform:
            spectrogram = self.transform(waveform)
        else:
            spectrogram = waveform

        # Fix NaN and inf values that can occur from AmplitudeToDB
        spectrogram = torch.nan_to_num(spectrogram, nan=0.0, posinf=0.0, neginf=-80.0)
        
        # Normalize to reasonable range
        spectrogram = torch.clamp(spectrogram, min=-80.0, max=0.0)

        return spectrogram, row['label']


@app.function(image=image, gpu="A10G", volumes={"/models": model_volume}, timeout=60 * 60 * 3)
def train_binary():
    """Train binary classifier"""
    from prepare_binary_dataset import prepare_binary_dataset
    from datetime import datetime
    
    # Step 1: Prepare combined dataset
    print("Preparing binary dataset...")
    prepare_binary_dataset()
    
    # Step 2: Setup training
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    binary_dir = Path("/opt/binary-data")

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
        T.FrequencyMasking(freq_mask_param=30),
        T.TimeMasking(time_mask_param=80)
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

    train_dataset = BinaryAudioDataset(
        data_dir=binary_dir / "audio",
        metadata_file=binary_dir / "meta" / "binary_metadata.csv",
        split="train",
        transform=train_transform
    )

    val_dataset = BinaryAudioDataset(
        data_dir=binary_dir / "audio",
        metadata_file=binary_dir / "meta" / "binary_metadata.csv",
        split="test",
        transform=val_transform
    )

    print(f"Training samples: {len(train_dataset)}")
    print(f"Val samples: {len(val_dataset)}")

    # Dynamic batch size: use 32 or smaller if dataset is tiny
    batch_size = min(32, max(8, len(train_dataset) // 4))  # At least 4 batches, min 8
    print(f"Using batch size: {batch_size}")
    
    train_dataloader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_dataloader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # Binary model: 2 classes only
    model = AudioCNN(num_classes=2)
    model.to(device)

    num_epochs = 30  # Binary classification converges faster
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)

    scheduler = OneCycleLR(
        optimizer,
        max_lr=0.003,
        epochs=num_epochs,
        steps_per_epoch=len(train_dataloader),
        pct_start=0.1
    )

    best_accuracy = 0.0

    print("Starting binary classification training...")
    for epoch in range(num_epochs):
        model.train()
        epoch_loss = 0.0

        progress_bar = tqdm(train_dataloader, desc=f'Epoch {epoch+1}/{num_epochs}')
        for data, target in progress_bar:
            data, target = data.to(device), target.to(device)

            output = model(data)
            loss = criterion(output, target)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            progress_bar.set_postfix({'Loss': f'{loss.item():.4f}'})

        avg_epoch_loss = epoch_loss / len(train_dataloader)

        # Validation
        model.eval()
        correct = 0
        total = 0
        val_loss = 0
        class_correct = [0, 0]  # [not_drone, drone]
        class_total = [0, 0]

        with torch.no_grad():
            for data, target in test_dataloader:
                data, target = data.to(device), target.to(device)
                outputs = model(data)
                loss = criterion(outputs, target)
                val_loss += loss.item()

                _, predicted = torch.max(outputs.data, 1)
                total += target.size(0)
                correct += (predicted == target).sum().item()
                
                # Per-class accuracy
                for i in range(len(target)):
                    label = target[i].item()
                    class_total[label] += 1
                    if predicted[i] == label:
                        class_correct[label] += 1

        accuracy = 100 * correct / total
        avg_val_loss = val_loss / len(test_dataloader)

        print(f'Epoch {epoch+1} Loss: {avg_epoch_loss:.4f}, Val Loss: {avg_val_loss:.4f}, Accuracy: {accuracy:.2f}%')
        print(f'  -> Validation: {correct}/{total} correct predictions')
        print(f'  -> Not-Drone: {class_correct[0]}/{class_total[0]} ({100*class_correct[0]/max(class_total[0],1):.1f}%), Drone: {class_correct[1]}/{class_total[1]} ({100*class_correct[1]/max(class_total[1],1):.1f}%)')

        if accuracy > best_accuracy:
            best_accuracy = accuracy
            torch.save({
                'model_state_dict': model.state_dict(),
                'accuracy': accuracy,
                'epoch': epoch,
                'classes': train_dataset.classes
            }, '/models/binary_model.pth')
            model_volume.commit()
            print(f'✅ New best binary model saved: {accuracy:.2f}%')

    print(f'Binary training completed! Best accuracy: {best_accuracy:.2f}%')


@app.local_entrypoint()
def main():
    train_binary.remote()

