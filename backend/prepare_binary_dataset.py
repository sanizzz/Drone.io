"""
Prepare binary classification dataset by combining drone + ESC-50 non-drone samples.
"""
import pandas as pd
from pathlib import Path
import shutil


def prepare_binary_dataset():
    # Source paths
    drone_dataset = Path("/opt/drone-data/audio")
    esc50_dataset = Path("/opt/esc50-data/audio")
    esc50_meta = pd.read_csv("/opt/esc50-data/meta/esc50.csv")
    
    # Output paths
    binary_audio = Path("/opt/binary-data/audio")
    binary_audio.mkdir(parents=True, exist_ok=True)
    (binary_audio / "drone").mkdir(exist_ok=True)
    (binary_audio / "not_drone").mkdir(exist_ok=True)
    
    records = []
    
    # 1. Copy all drone files (flatten A-J folders)
    drone_count = 0
    for drone_folder in drone_dataset.glob("drone_*"):
        for audio_file in drone_folder.glob("*.wav"):
            dest = binary_audio / "drone" / audio_file.name
            shutil.copy(audio_file, dest)
            records.append({
                "filename": f"drone/{audio_file.name}",
                "category": "drone",
                "fold": (drone_count % 5) + 1  # Distribute across 5 folds
            })
            drone_count += 1
    
    # 2. Copy non-drone samples from ESC-50
    non_drone_classes = [
        'airplane', 'helicopter', 'chainsaw', 'engine', 'wind', 'rain',
        'thunderstorm', 'crickets', 'insects', 'dog', 'rooster', 'crow',
        'sea_waves', 'crackling_fire', 'footsteps', 'breathing', 'coughing',
        'sneezing', 'clapping', 'laughing', 'can_opening', 'car_horn',
        'siren', 'train', 'church_bells', 'vacuum_cleaner', 'clock_alarm',
        'door_wood_knock', 'mouse_click', 'keyboard_typing'
    ]
    
    non_drone_files = esc50_meta[esc50_meta['category'].isin(non_drone_classes)]
    
    for idx, row in non_drone_files.iterrows():
        src = esc50_dataset / row['filename']
        dest = binary_audio / "not_drone" / row['filename']
        shutil.copy(src, dest)
        records.append({
            "filename": f"not_drone/{row['filename']}",
            "category": "not_drone",
            "fold": row['fold']
        })
    
    # 3. Create metadata CSV
    df = pd.DataFrame(records)
    meta_dir = Path("/opt/binary-data/meta")
    meta_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(meta_dir / "binary_metadata.csv", index=False)
    
    print(f"✅ Binary dataset created:")
    print(f"   - Drone samples: {drone_count}")
    print(f"   - Non-drone samples: {len(non_drone_files)}")
    print(f"   - Total: {len(df)}")
    print(f"   - Train/test split: fold 5 = test, rest = train")


if __name__ == "__main__":
    prepare_binary_dataset()

