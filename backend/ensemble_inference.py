"""
Ensemble inference system combining multiple models for superior accuracy
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pathlib import Path
import modal
import torchaudio.transforms as T
from model import AudioCNN


class EnsembleModel:
    """Ensemble of multiple models with different architectures/training"""
    def __init__(self, model_paths, device='cuda'):
        self.device = device
        self.models = []
        self.weights = []
        
        # Load all models
        for path in model_paths:
            checkpoint = torch.load(path, map_location=device)
            model = AudioCNN(num_classes=len(checkpoint['classes']))
            model.load_state_dict(checkpoint['model_state_dict'])
            model.to(device)
            model.eval()
            
            self.models.append(model)
            # Weight models by their validation accuracy
            self.weights.append(checkpoint.get('accuracy', 1.0) / 100.0)
        
        # Normalize weights
        total_weight = sum(self.weights)
        self.weights = [w / total_weight for w in self.weights]
        
        print(f"✅ Loaded {len(self.models)} models for ensemble")
        print(f"   Weights: {self.weights}")
    
    def predict(self, x, temperature=1.0):
        """
        Ensemble prediction with temperature scaling
        Args:
            x: Input tensor
            temperature: Temperature for softmax (higher = more uncertain)
        """
        predictions = []
        
        with torch.no_grad():
            for model, weight in zip(self.models, self.weights):
                output = model(x)
                # Temperature scaling for calibration
                output = output / temperature
                probs = F.softmax(output, dim=1)
                predictions.append(probs * weight)
        
        # Weighted average of predictions
        ensemble_pred = torch.stack(predictions).sum(dim=0)
        
        return ensemble_pred
    
    def predict_with_uncertainty(self, x, n_samples=10):
        """
        Predict with uncertainty estimation using dropout sampling
        """
        predictions = []
        
        # Enable dropout for uncertainty
        for model in self.models:
            model.train()
        
        with torch.no_grad():
            for _ in range(n_samples):
                sample_preds = []
                for model, weight in zip(self.models, self.weights):
                    output = model(x)
                    probs = F.softmax(output, dim=1)
                    sample_preds.append(probs * weight)
                
                ensemble_pred = torch.stack(sample_preds).sum(dim=0)
                predictions.append(ensemble_pred)
        
        # Set models back to eval
        for model in self.models:
            model.eval()
        
        predictions = torch.stack(predictions)
        mean_pred = predictions.mean(dim=0)
        uncertainty = predictions.std(dim=0)
        
        return mean_pred, uncertainty


class TestTimeAugmentation:
    """Test-time augmentation for better predictions"""
    def __init__(self, n_augmentations=5):
        self.n_augmentations = n_augmentations
        
        # Different augmentation strategies
        self.augmentations = [
            lambda x: x,  # Original
            lambda x: self._add_noise(x, 0.01),
            lambda x: self._shift_time(x, 10),
            lambda x: self._shift_freq(x, 5),
            lambda x: self._change_amplitude(x, 0.1)
        ]
    
    def _add_noise(self, x, noise_level):
        noise = torch.randn_like(x) * noise_level
        return x + noise
    
    def _shift_time(self, x, shift):
        return torch.roll(x, shifts=shift, dims=-1)
    
    def _shift_freq(self, x, shift):
        return torch.roll(x, shifts=shift, dims=-2)
    
    def _change_amplitude(self, x, factor):
        return x * (1 + torch.randn(1).item() * factor)
    
    def augment_and_predict(self, model, x):
        """Apply TTA and average predictions"""
        predictions = []
        
        for aug_fn in self.augmentations[:self.n_augmentations]:
            aug_x = aug_fn(x)
            if isinstance(model, EnsembleModel):
                pred = model.predict(aug_x)
            else:
                with torch.no_grad():
                    pred = F.softmax(model(aug_x), dim=1)
            predictions.append(pred)
        
        # Average predictions
        return torch.stack(predictions).mean(dim=0)


# Modal app for ensemble inference
app = modal.App("ensemble-inference")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .apt_install(["libsndfile1"])
    .add_local_python_source("model")
)

model_volume = modal.Volume.from_name("esc-model")


@app.cls(
    image=image,
    gpu="A10G",
    volumes={"/models": model_volume},
    scaledown_window=30
)
class EnsembleInference:
    @modal.enter()
    def load_models(self):
        """Load ensemble of models on container start"""
        import os
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Find all available models
        model_paths = []
        
        # Primary models
        if os.path.exists('/models/best_model.pth'):
            model_paths.append('/models/best_model.pth')
        
        if os.path.exists('/models/best_model_advanced.pth'):
            model_paths.append('/models/best_model_advanced.pth')
        
        # Load checkpoint to get classes
        if model_paths:
            checkpoint = torch.load(model_paths[0], map_location=self.device)
            self.classes = checkpoint['classes']
        else:
            raise FileNotFoundError("No trained models found!")
        
        # Create ensemble if multiple models available
        if len(model_paths) > 1:
            print("🎯 Using ensemble of models")
            self.model = EnsembleModel(model_paths, self.device)
            self.use_ensemble = True
        else:
            print("📊 Using single model")
            checkpoint = torch.load(model_paths[0], map_location=self.device)
            self.model = AudioCNN(num_classes=len(self.classes))
            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.model.to(self.device)
            self.model.eval()
            self.use_ensemble = False
        
        # Initialize TTA
        self.tta = TestTimeAugmentation(n_augmentations=5)
        
        # Audio processor
        self.transform = nn.Sequential(
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
        
        print("✅ Models loaded and ready for inference")
    
    @modal.method()
    def predict(self, audio_data, use_tta=True, return_uncertainty=False):
        """
        Enhanced prediction with ensemble and TTA
        
        Args:
            audio_data: Audio waveform (numpy array)
            use_tta: Whether to use test-time augmentation
            return_uncertainty: Whether to return uncertainty estimates
        """
        # Preprocess audio
        waveform = torch.from_numpy(audio_data).float()
        if waveform.dim() == 1:
            waveform = waveform.unsqueeze(0)
        
        # Fixed-length preprocessing
        target_length = 110250
        current_length = waveform.shape[1]
        
        if current_length > target_length:
            start_idx = (current_length - target_length) // 2
            waveform = waveform[:, start_idx:start_idx + target_length]
        elif current_length < target_length:
            pad_length = target_length - current_length
            waveform = F.pad(waveform, (0, pad_length), mode='constant', value=0)
        
        # Transform to spectrogram
        spectrogram = self.transform(waveform)
        spectrogram = torch.nan_to_num(spectrogram, nan=0.0, posinf=0.0, neginf=-80.0)
        spectrogram = torch.clamp(spectrogram, min=-80.0, max=0.0)
        spectrogram = spectrogram.unsqueeze(0).to(self.device)
        
        # Predict
        if use_tta:
            predictions = self.tta.augment_and_predict(self.model, spectrogram)
        else:
            if self.use_ensemble:
                predictions = self.model.predict(spectrogram)
            else:
                with torch.no_grad():
                    predictions = F.softmax(self.model(spectrogram), dim=1)
        
        # Get uncertainty if requested
        uncertainty = None
        if return_uncertainty and self.use_ensemble:
            predictions, uncertainty = self.model.predict_with_uncertainty(spectrogram)
        
        # Get top predictions
        top5_probs, top5_indices = torch.topk(predictions[0], 5)
        
        results = {
            'predictions': [
                {
                    'class': self.classes[idx.item()],
                    'confidence': prob.item(),
                    'uncertainty': uncertainty[0][idx].item() if uncertainty is not None else None
                }
                for prob, idx in zip(top5_probs, top5_indices)
            ],
            'use_ensemble': self.use_ensemble,
            'use_tta': use_tta
        }
        
        return results


@app.local_entrypoint()
def test_ensemble():
    """Test ensemble inference"""
    import soundfile as sf
    import numpy as np
    
    # Create dummy audio for testing
    sample_rate = 22050
    duration = 5
    audio_data = np.random.randn(sample_rate * duration).astype(np.float32)
    
    # Run inference
    inference = EnsembleInference()
    results = inference.predict.remote(audio_data, use_tta=True, return_uncertainty=True)
    
    print("\n🎯 Ensemble Inference Results:")
    print(f"   Using ensemble: {results['use_ensemble']}")
    print(f"   Using TTA: {results['use_tta']}")
    print("\n   Top 5 predictions:")
    
    for i, pred in enumerate(results['predictions'], 1):
        uncertainty_str = f" (±{pred['uncertainty']:.4f})" if pred['uncertainty'] else ""
        print(f"   {i}. {pred['class']}: {pred['confidence']:.2%}{uncertainty_str}")
    
    print("\n✨ Ensemble inference ready for production!")
