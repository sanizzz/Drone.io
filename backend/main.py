import base64
import io
import modal
import numpy as np
import requests
import torch.nn as nn
import torchaudio.transforms as T
import torch
from fastapi import File, HTTPException, Request, UploadFile, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import soundfile as sf
import librosa

from model import AudioCNN

app = modal.App("audio-cnn-inference")

image = (modal.Image.debian_slim()
         .pip_install_from_requirements("requirements.txt")
         .apt_install(["libsndfile1"])
         .add_local_python_source("model")
         .add_local_python_source("bpf_distance"))

model_volume = modal.Volume.from_name("drone-model")


class AudioProcessor:
    def __init__(self):
        self.transform = nn.Sequential(
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

    def process_audio_chunk(self, audio_data):
        waveform = torch.from_numpy(audio_data).float()
        waveform = waveform.unsqueeze(0)
        
        # Fixed-length audio preprocessing (MUST match training!)
        # 5 seconds at 22050 Hz = 110,250 samples
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
        
        spectrogram = self.transform(waveform)
        
        # Fix NaN and inf values that can occur from AmplitudeToDB
        spectrogram = torch.nan_to_num(spectrogram, nan=0.0, posinf=0.0, neginf=-80.0)
        
        # Normalize to reasonable range
        spectrogram = torch.clamp(spectrogram, min=-80.0, max=0.0)
        
        return spectrogram.unsqueeze(0)


class InferenceRequest(BaseModel):
    audio_data: str


@app.cls(image=image, gpu="A10G", volumes={"/models": model_volume}, scaledown_window=15)
class AudioClassifier:
    @modal.enter()
    def load_model(self):
        import json
        import os
        
        print("Loading models on container start...")
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Check model files exist
        binary_model_path = '/models/binary_model.pth'
        multiclass_model_path = '/models/best_model.pth'
        
        if not os.path.exists(binary_model_path):
            raise FileNotFoundError(
                f"❌ Binary model not found at {binary_model_path}. "
                "Please train it first: modal run train_binary.py"
            )
        
        if not os.path.exists(multiclass_model_path):
            raise FileNotFoundError(
                f"❌ Multi-class model not found at {multiclass_model_path}. "
                "Please train it first: modal run train.py"
            )

        # Load binary classifier (Stage 1)
        binary_checkpoint = torch.load(binary_model_path, map_location=self.device)
        self.binary_classes = binary_checkpoint['classes']  # ['not_drone', 'drone']
        
        self.binary_model = AudioCNN(num_classes=2)
        self.binary_model.load_state_dict(binary_checkpoint['model_state_dict'])
        self.binary_model.to(self.device)
        self.binary_model.eval()
        print(f"✅ Binary model loaded (accuracy: {binary_checkpoint['accuracy']:.2f}%)")

        # Load multi-class classifier (Stage 2)
        multiclass_checkpoint = torch.load(multiclass_model_path, map_location=self.device)
        self.drone_classes = multiclass_checkpoint['classes']  # ['drone_A', ..., 'drone_J']
        
        self.multiclass_model = AudioCNN(num_classes=len(self.drone_classes))
        self.multiclass_model.load_state_dict(multiclass_checkpoint['model_state_dict'])
        self.multiclass_model.to(self.device)
        self.multiclass_model.eval()
        print(f"✅ Multi-class model loaded (accuracy: {multiclass_checkpoint['accuracy']:.2f}%)")

        self.audio_processor = AudioProcessor()
        
        # Load calibration
        calib_path = '/models/calibration.json'
        if os.path.exists(calib_path):
            with open(calib_path, 'r') as f:
                self.calibration = json.load(f)
            print(f"✅ Calibration loaded: {len(self.calibration.get('drone_classes', {}))} classes")
        else:
            print("⚠️  No calibration.json found, using defaults")
            self.calibration = {"alpha": 0.01, "drone_classes": {}}

    @modal.fastapi_endpoint(method="POST")
    async def inference(self, request: Request, file: UploadFile = File(default=None)):
        audio_bytes = None

        # Read audio file
        if file is not None:
            try:
                audio_bytes = await file.read()
            except Exception as exc:
                raise HTTPException(status_code=400, detail="Failed to read file") from exc
        else:
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            audio_b64 = payload.get("audio_data")
            if audio_b64:
                try:
                    audio_bytes = base64.b64decode(audio_b64)
                except Exception as exc:
                    raise HTTPException(status_code=400, detail="Invalid base64") from exc

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="No audio data")

        # Preprocess audio
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        # Validate sample rate
        if sample_rate < 8000 or sample_rate > 96000:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid sample rate {sample_rate}Hz. Expected 8kHz-96kHz (standard audio range)"
            )

        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Validate audio duration
        max_duration = 60  # seconds
        duration = len(audio_data) / sample_rate
        if duration > max_duration:
            raise HTTPException(
                status_code=400,
                detail=f"Audio too long. Maximum {max_duration}s allowed, got {duration:.1f}s"
            )
        
        if duration < 0.1:
            raise HTTPException(
                status_code=400,
                detail=f"Audio too short. Minimum 0.1s required, got {duration:.2f}s"
            )

        # Resample to 22050 Hz if needed
        if sample_rate != 22050:
            audio_data = librosa.resample(y=audio_data, orig_sr=sample_rate, target_sr=22050)

        spectrogram = self.audio_processor.process_audio_chunk(audio_data)
        spectrogram = spectrogram.to(self.device)

        # ===== STAGE 1: Binary Classification =====
        with torch.no_grad():
            binary_output = self.binary_model(spectrogram)
            binary_probs = torch.softmax(binary_output, dim=1)
            binary_predicted_idx = torch.argmax(binary_probs[0]).item()
            binary_confidence = binary_probs[0][binary_predicted_idx].item()
            
            is_drone = self.binary_classes[binary_predicted_idx] == "drone"

        print(f"Binary classification: {'DRONE' if is_drone else 'NOT DRONE'} (confidence: {binary_confidence:.2%})")

        # If not a drone, return early
        if not is_drone:
            return JSONResponse(
                content={
                    "is_drone": False,
                    "binary_confidence": binary_confidence,
                    "predictions": None,
                    "distance_m": None,
                    "ci": None,
                    "confidence_distance": None,
                    "bpf_hz": None
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            )

        # ===== STAGE 2: Multi-Class Classification =====
        with torch.no_grad():
            output, feature_maps = self.multiclass_model(spectrogram, return_feature_maps=True)
            output = torch.nan_to_num(output)
            probabilities = torch.softmax(output, dim=1)
            top3_probs, top3_indices = torch.topk(probabilities[0], 3)

            predictions = [
                {"class": self.drone_classes[idx.item()], "confidence": prob.item()}
                for prob, idx in zip(top3_probs, top3_indices)
            ]

            top_class = self.drone_classes[top3_indices[0].item()]

            # Visualization data
            viz_data = {}
            for name, tensor in feature_maps.items():
                if tensor.dim() == 4:
                    aggregated = torch.mean(tensor, dim=1)
                    squeezed = aggregated.squeeze(0)
                    numpy_array = squeezed.cpu().numpy()
                    clean_array = np.nan_to_num(numpy_array)
                    viz_data[name] = {
                        "shape": list(clean_array.shape),
                        "values": clean_array.tolist()
                    }

            spectrogram_np = spectrogram.squeeze(0).squeeze(0).cpu().numpy()
            clean_spectrogram = np.nan_to_num(spectrogram_np)

        # ===== STAGE 3: Distance Estimation =====
        distance_result = None
        try:
            from bpf_distance import detect_bpf_and_distance
            distance_result = detect_bpf_and_distance(
                waveform=audio_data,
                sample_rate=22050,
                drone_class=top_class,
                calibration=self.calibration
            )
        except Exception as e:
            print(f"⚠️  Distance estimation failed: {e}")
            distance_result = {
                "distance_m": None,
                "ci": None,
                "confidence": None,
                "bpf_hz": None
            }

        # Downsample waveform for response
        max_samples = 8000
        if len(audio_data) > max_samples:
            step = len(audio_data) // max_samples
            waveform_data = audio_data[::step]
        else:
            waveform_data = audio_data

        # Build final response
        response = {
            "is_drone": True,
            "binary_confidence": binary_confidence,
            "predictions": predictions,
            "distance_m": distance_result["distance_m"],
            "ci": distance_result["ci"],
            "confidence_distance": distance_result["confidence"],
            "bpf_hz": distance_result["bpf_hz"],
            "visualization": viz_data,
            "input_spectrogram": {
                "shape": list(clean_spectrogram.shape),
                "values": clean_spectrogram.tolist()
            },
            "waveform": {
                "values": waveform_data.tolist(),
                "sample_rate": 22050,
                "duration": len(audio_data) / 22050
            }
        }

        return JSONResponse(
            content=response,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )

    @modal.fastapi_endpoint(method="OPTIONS")
    async def inference_options(self):
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )


@app.local_entrypoint()
def main():
    """Test inference locally"""
    import sys
    if len(sys.argv) < 2:
        print("Usage: modal run main.py <audio_file.wav>")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    audio_data, sample_rate = sf.read(audio_file)
    
    buffer = io.BytesIO()
    sf.write(buffer, audio_data, sample_rate, format="WAV")
    buffer.seek(0)

    server = AudioClassifier()
    url = server.inference.get_web_url()
    files = {"file": (audio_file, buffer, "audio/wav")}
    response = requests.post(url, files=files)
    response.raise_for_status()

    result = response.json()
    print(f"\n{'='*60}")
    print(f"Is drone: {result['is_drone']}")
    print(f"Binary confidence: {result['binary_confidence']:.2%}")
    if result['is_drone']:
        print("\nTop predictions:")
        for pred in result['predictions']:
            print(f"  - {pred['class']}: {pred['confidence']:.2%}")
        print(f"\nDistance: {result['distance_m']:.1f}m")
        print(f"Confidence interval: [{result['ci'][0]:.1f}m, {result['ci'][1]:.1f}m]")
        print(f"Distance confidence: {result['confidence_distance']:.2%}")
        print(f"BPF detected: {result['bpf_hz']:.1f} Hz")
    print(f"{'='*60}\n")
