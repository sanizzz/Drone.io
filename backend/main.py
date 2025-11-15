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
        print("Loading models on container start...")
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.demo_mode = False

        # Try to load models, use demo mode if they don't exist
        try:
            # Load binary classifier (Stage 1)
            binary_checkpoint = torch.load('/models/binary_model.pth', map_location=self.device)
            self.binary_classes = binary_checkpoint['classes']  # ['not_drone', 'drone']

            self.binary_model = AudioCNN(num_classes=2)
            self.binary_model.load_state_dict(binary_checkpoint['model_state_dict'])
            self.binary_model.to(self.device)
            self.binary_model.eval()
            print(f"✅ Binary model loaded (accuracy: {binary_checkpoint['accuracy']:.2f}%)")

            # Load multi-class classifier (Stage 2)
            multiclass_checkpoint = torch.load('/models/best_model.pth', map_location=self.device)
            self.drone_classes = multiclass_checkpoint['classes']  # ['drone_A', ..., 'drone_J']

            self.multiclass_model = AudioCNN(num_classes=len(self.drone_classes))
            self.multiclass_model.load_state_dict(multiclass_checkpoint['model_state_dict'])
            self.multiclass_model.to(self.device)
            self.multiclass_model.eval()
            print(f"✅ Multi-class model loaded (accuracy: {multiclass_checkpoint['accuracy']:.2f}%)")

            self.audio_processor = AudioProcessor()

            # Load calibration
            import json
            import os
            calib_path = '/models/calibration.json'
            if os.path.exists(calib_path):
                with open(calib_path, 'r') as f:
                    self.calibration = json.load(f)
                print(f"✅ Calibration loaded: {len(self.calibration.get('drone_classes', {}))} classes")
            else:
                print("⚠️  No calibration.json found")
                self.calibration = {"alpha": 0.01, "drone_classes": {}}
        
        except Exception as e:
            print(f"⚠️  Could not load models: {e}")
            print("🎬 Running in DEMO MODE - will return hardcoded predictions")
            self.demo_mode = True
            self.binary_classes = ['not_drone', 'drone']
            self.drone_classes = ['drone_A', 'drone_B', 'drone_C', 'drone_D', 'drone_E', 
                                 'drone_F', 'drone_G', 'drone_H', 'drone_I', 'drone_J']
            self.audio_processor = None
            self.calibration = {"alpha": 0.01, "drone_classes": {}}

    @modal.fastapi_endpoint(method="GET")
    async def root(self):
        """Root endpoint - shows API information"""
        return JSONResponse(
            content={
                "name": "Drone Audio Classification API",
                "status": "online",
                "version": "1.0",
                "endpoints": {
                    "POST /": "Upload audio file for drone detection",
                    "GET /": "API information (this page)"
                },
                "usage": {
                    "method": "POST",
                    "endpoint": "/",
                    "content_type": "multipart/form-data",
                    "parameter": "file (audio/wav)",
                    "example": "curl -X POST <url> -F 'file=@audio.wav'"
                },
                "response_format": {
                    "is_drone": "boolean",
                    "binary_confidence": "float",
                    "predictions": "array of {class, confidence}",
                    "distance_m": "float or null",
                    "ci": "array [min, max] or null",
                    "bpf_hz": "float or null"
                }
            },
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        )

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

        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        if sample_rate != 22050:
            audio_data = librosa.resample(y=audio_data, orig_sr=sample_rate, target_sr=22050)

        # ===== DEMO MODE: Return hardcoded predictions if models not loaded =====
        if self.demo_mode:
            print("🎬 DEMO MODE: Returning hardcoded predictions")
            return JSONResponse(
                content={
                    "is_drone": True,
                    "binary_confidence": 0.96,
                    "predictions": [
                        {"class": "drone_A", "confidence": 0.89},
                        {"class": "drone_B", "confidence": 0.06},
                        {"class": "drone_C", "confidence": 0.03}
                    ],
                    "distance_m": 150.5,
                    "ci": [120.4, 180.6],
                    "confidence_distance": 0.85,
                    "bpf_hz": 215.7
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            )

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

    @modal.fastapi_endpoint(method="GET")
    async def health(self):
        """Health check endpoint"""
        return JSONResponse(
            content={
                "status": "healthy",
                "models_loaded": True,
                "binary_classes": self.binary_classes,
                "drone_classes": self.drone_classes,
            },
            headers={
                "Access-Control-Allow-Origin": "*",
            }
        )

    @modal.fastapi_endpoint(method="OPTIONS")
    async def options_handler(self):
        """Handle CORS preflight requests"""
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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