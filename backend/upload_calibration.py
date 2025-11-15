import modal
import json

app = modal.App("upload-calibration")
model_volume = modal.Volume.from_name("drone-model")


@app.function(volumes={"/models": model_volume})
def upload_calibration():
    """Upload calibration.json to Modal Volume."""
    calibration = {
        "alpha": 0.01,
        "drone_classes": {
            "drone_A": {"L0": 82.5},
            "drone_B": {"L0": 81.0},
            "drone_C": {"L0": 83.2},
            "drone_D": {"L0": 80.8},
            "drone_E": {"L0": 82.0},
            "drone_F": {"L0": 81.5},
            "drone_G": {"L0": 82.8},
            "drone_H": {"L0": 81.2},
            "drone_I": {"L0": 82.3},
            "drone_J": {"L0": 81.7}
        }
    }
    
    with open("/models/calibration.json", "w") as f:
        json.dump(calibration, f, indent=2)
    
    model_volume.commit()
    print("✅ Calibration data uploaded to /models/calibration.json")


@app.local_entrypoint()
def main():
    upload_calibration.remote()

