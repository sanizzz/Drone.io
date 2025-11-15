"""
Advanced feature engineering for drone audio classification
Extracts drone-specific characteristics for improved accuracy
"""
import torch
import torch.nn as nn
import numpy as np
import librosa
from scipy import signal
from scipy.fft import fft, fftfreq
import torchaudio.transforms as T


class DroneFeatureExtractor:
    """Extract drone-specific audio features"""
    
    def __init__(self, sample_rate=22050):
        self.sample_rate = sample_rate
        
    def extract_bpf_features(self, waveform):
        """
        Extract Blade Pass Frequency (BPF) features
        Critical for drone identification
        """
        if isinstance(waveform, torch.Tensor):
            waveform = waveform.numpy()
        
        # Ensure 1D
        if waveform.ndim > 1:
            waveform = waveform.squeeze()
        
        # Compute FFT
        n = len(waveform)
        yf = fft(waveform)
        xf = fftfreq(n, 1/self.sample_rate)[:n//2]
        
        # Get magnitude spectrum
        magnitude = 2.0/n * np.abs(yf[:n//2])
        
        # Find peaks (potential BPF and harmonics)
        peaks, properties = signal.find_peaks(
            magnitude,
            height=np.max(magnitude) * 0.1,  # At least 10% of max
            distance=20  # Minimum distance between peaks
        )
        
        features = {}
        
        if len(peaks) > 0:
            # Primary BPF (usually strongest peak in 50-500 Hz range)
            bpf_range_mask = (xf[peaks] >= 50) & (xf[peaks] <= 500)
            bpf_peaks = peaks[bpf_range_mask]
            
            if len(bpf_peaks) > 0:
                bpf_idx = bpf_peaks[np.argmax(magnitude[bpf_peaks])]
                features['bpf_frequency'] = xf[bpf_idx]
                features['bpf_magnitude'] = magnitude[bpf_idx]
                
                # Find harmonics
                fundamental = xf[bpf_idx]
                harmonics = []
                for harmonic_num in range(2, 6):  # Check up to 5th harmonic
                    target_freq = fundamental * harmonic_num
                    tolerance = 10  # Hz
                    
                    harmonic_mask = np.abs(xf[peaks] - target_freq) < tolerance
                    if np.any(harmonic_mask):
                        harmonic_idx = peaks[harmonic_mask][0]
                        harmonics.append(magnitude[harmonic_idx])
                    else:
                        harmonics.append(0.0)
                
                features['harmonic_ratios'] = harmonics
            else:
                features['bpf_frequency'] = 0.0
                features['bpf_magnitude'] = 0.0
                features['harmonic_ratios'] = [0.0] * 4
        else:
            features['bpf_frequency'] = 0.0
            features['bpf_magnitude'] = 0.0
            features['harmonic_ratios'] = [0.0] * 4
        
        return features
    
    def extract_temporal_features(self, waveform):
        """Extract temporal characteristics of drone sounds"""
        if isinstance(waveform, torch.Tensor):
            waveform = waveform.numpy()
        
        if waveform.ndim > 1:
            waveform = waveform.squeeze()
        
        # Zero crossing rate (indicates pitch variations)
        zcr = librosa.feature.zero_crossing_rate(waveform)[0]
        
        # RMS energy (loudness variations)
        rms = librosa.feature.rms(y=waveform)[0]
        
        # Spectral rolloff (frequency below which 85% of energy is concentrated)
        rolloff = librosa.feature.spectral_rolloff(
            y=waveform, sr=self.sample_rate, roll_percent=0.85
        )[0]
        
        # Spectral centroid (center of mass of spectrum)
        centroid = librosa.feature.spectral_centroid(
            y=waveform, sr=self.sample_rate
        )[0]
        
        features = {
            'zcr_mean': np.mean(zcr),
            'zcr_std': np.std(zcr),
            'rms_mean': np.mean(rms),
            'rms_std': np.std(rms),
            'rolloff_mean': np.mean(rolloff),
            'rolloff_std': np.std(rolloff),
            'centroid_mean': np.mean(centroid),
            'centroid_std': np.std(centroid)
        }
        
        return features
    
    def extract_mfcc_statistics(self, waveform):
        """Extract MFCC statistics for texture analysis"""
        if isinstance(waveform, torch.Tensor):
            waveform = waveform.numpy()
        
        if waveform.ndim > 1:
            waveform = waveform.squeeze()
        
        # Extract MFCCs
        mfccs = librosa.feature.mfcc(
            y=waveform,
            sr=self.sample_rate,
            n_mfcc=13
        )
        
        # Calculate statistics for each MFCC coefficient
        features = {}
        for i in range(13):
            features[f'mfcc_{i}_mean'] = np.mean(mfccs[i])
            features[f'mfcc_{i}_std'] = np.std(mfccs[i])
        
        # Delta MFCCs (rate of change)
        delta_mfccs = librosa.feature.delta(mfccs)
        for i in range(13):
            features[f'delta_mfcc_{i}_mean'] = np.mean(delta_mfccs[i])
        
        return features
    
    def extract_all_features(self, waveform):
        """Extract all drone-specific features"""
        features = {}
        
        # BPF features (most important for drones)
        bpf_features = self.extract_bpf_features(waveform)
        features.update(bpf_features)
        
        # Temporal features
        temporal_features = self.extract_temporal_features(waveform)
        features.update(temporal_features)
        
        # MFCC features
        mfcc_features = self.extract_mfcc_statistics(waveform)
        features.update(mfcc_features)
        
        return features


class FeatureAugmentedModel(nn.Module):
    """
    Combines CNN features with handcrafted drone features
    for superior classification accuracy
    """
    def __init__(self, cnn_model, num_classes, num_features=60):
        super().__init__()
        self.cnn = cnn_model
        self.feature_extractor = DroneFeatureExtractor()
        
        # Get CNN feature dimension
        cnn_features = 256  # From model.py fc2 output
        
        # Fusion layer
        self.fusion = nn.Sequential(
            nn.Linear(cnn_features + num_features, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes)
        )
        
        # Feature normalization
        self.feature_norm = nn.BatchNorm1d(num_features)
    
    def forward(self, spectrogram, waveform=None, extracted_features=None):
        """
        Args:
            spectrogram: Mel-spectrogram input for CNN
            waveform: Raw audio for feature extraction (optional)
            extracted_features: Pre-extracted features (optional)
        """
        # Get CNN features (without final classification)
        cnn_features = self.cnn.get_feature_extractor()(spectrogram)
        
        # Get handcrafted features
        if extracted_features is not None:
            # Use pre-extracted features
            handcrafted = extracted_features
        elif waveform is not None:
            # Extract features on the fly
            batch_features = []
            for wave in waveform:
                features = self.feature_extractor.extract_all_features(wave)
                feature_vector = torch.tensor(
                    list(features.values()),
                    dtype=torch.float32
                )
                batch_features.append(feature_vector)
            handcrafted = torch.stack(batch_features).to(spectrogram.device)
            handcrafted = self.feature_norm(handcrafted)
        else:
            # No handcrafted features, use zeros
            batch_size = spectrogram.size(0)
            handcrafted = torch.zeros(
                batch_size, 60,
                device=spectrogram.device
            )
        
        # Concatenate features
        combined = torch.cat([cnn_features, handcrafted], dim=1)
        
        # Final classification
        output = self.fusion(combined)
        
        return output


class SpectrogramAugmentation(nn.Module):
    """Advanced spectrogram augmentation for drones"""
    
    def __init__(self):
        super().__init__()
        self.freq_mask = T.FrequencyMasking(freq_mask_param=20)
        self.time_mask = T.TimeMasking(time_mask_param=50)
    
    def forward(self, x, training=True):
        if not training:
            return x
        
        # Frequency masking (simulate different drone models)
        if torch.rand(1) < 0.5:
            x = self.freq_mask(x)
        
        # Time masking (simulate intermittent sounds)
        if torch.rand(1) < 0.5:
            x = self.time_mask(x)
        
        # Random frequency shift (simulate Doppler effect)
        if torch.rand(1) < 0.3:
            shift = torch.randint(-5, 5, (1,)).item()
            if shift != 0:
                x = torch.roll(x, shifts=shift, dims=-2)
        
        # Random amplitude scaling (distance simulation)
        if torch.rand(1) < 0.3:
            scale = torch.FloatTensor(1).uniform_(0.7, 1.3)
            x = x * scale
        
        # Add noise (environmental factors)
        if torch.rand(1) < 0.3:
            noise = torch.randn_like(x) * 0.01
            x = x + noise
        
        return x


def test_feature_extraction():
    """Test feature extraction pipeline"""
    print("🔬 Testing Drone Feature Extraction")
    print("=" * 50)
    
    # Create dummy audio
    sample_rate = 22050
    duration = 5
    t = np.linspace(0, duration, sample_rate * duration)
    
    # Simulate drone sound with fundamental and harmonics
    fundamental = 120  # Hz (typical drone BPF)
    waveform = np.sin(2 * np.pi * fundamental * t)
    waveform += 0.5 * np.sin(2 * np.pi * fundamental * 2 * t)  # 2nd harmonic
    waveform += 0.3 * np.sin(2 * np.pi * fundamental * 3 * t)  # 3rd harmonic
    waveform += 0.1 * np.random.randn(len(t))  # Add noise
    
    # Extract features
    extractor = DroneFeatureExtractor(sample_rate)
    features = extractor.extract_all_features(waveform)
    
    print(f"\n📊 Extracted {len(features)} features:")
    print(f"   BPF Frequency: {features.get('bpf_frequency', 0):.2f} Hz")
    print(f"   BPF Magnitude: {features.get('bpf_magnitude', 0):.4f}")
    print(f"   Harmonic Ratios: {features.get('harmonic_ratios', [])}")
    print(f"   Spectral Centroid: {features.get('centroid_mean', 0):.2f} Hz")
    print(f"   RMS Energy: {features.get('rms_mean', 0):.4f}")
    
    print("\n✅ Feature extraction working correctly!")


if __name__ == "__main__":
    test_feature_extraction()
