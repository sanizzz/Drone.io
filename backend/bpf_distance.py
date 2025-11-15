"""
Blade-Pass Frequency (BPF) based distance estimation.

Physics: L_p(r) ≈ L_0 - 20*log10(r/r0) - α(f)*r

Where:
- L_p(r) = Sound pressure level at distance r
- L_0 = Reference level at r0 = 1m
- α(f) = Frequency-dependent air absorption
- r = Distance to solve for
"""

import numpy as np


def detect_bpf_and_distance(
    waveform: np.ndarray,
    sample_rate: int,
    drone_class: str,
    calibration: dict
) -> dict:
    """
    Estimate drone distance using BPF harmonic analysis and inverse square law.
    
    Algorithm:
    1. Compute FFT of audio waveform
    2. Find dominant BPF in 80-600 Hz range (typical for small multirotors)
    3. Find 2nd harmonic (2x BPF frequency)
    4. Sum amplitudes of BPF + 2nd harmonic
    5. Convert to dB scale
    6. Apply inverse square law: r = r0 * 10^((L0 - L_measured)/20)
    
    Args:
        waveform: Audio samples, shape [n_samples], mono channel
        sample_rate: Sample rate in Hz (must be 22050)
        drone_class: Predicted drone class (e.g., "drone_A")
        calibration: Calibration dictionary with structure:
            {
                "alpha": 0.01,  # Air absorption coefficient
                "drone_classes": {
                    "drone_A": {"L0": 82.5},  # Reference SPL at 1m
                    ...
                }
            }
    
    Returns:
        {
            "distance_m": float,       # Estimated distance (meters)
            "ci": [lo, hi],           # 95% confidence interval (meters)
            "confidence": float,      # Confidence score [0, 1]
            "bpf_hz": float          # Detected BPF (Hz)
        }
    """
    
    # Input validation
    if len(waveform) == 0:
        raise ValueError("Empty waveform provided")
    
    if sample_rate != 22050:
        raise ValueError(f"Expected sample_rate=22050 Hz, got {sample_rate} Hz")
    
    if not isinstance(waveform, np.ndarray):
        raise TypeError(f"Waveform must be numpy array, got {type(waveform)}")
    
    if waveform.ndim != 1:
        raise ValueError(f"Waveform must be 1D (mono), got shape {waveform.shape}")
    
    # 1. Compute FFT (Fast Fourier Transform)
    fft = np.fft.rfft(waveform)  # Real FFT (positive frequencies only)
    freqs = np.fft.rfftfreq(len(waveform), 1.0 / sample_rate)
    magnitudes = np.abs(fft)
    
    # 2. Find BPF peak in 80-600 Hz range
    # This is typical for small quadcopter/multirotor drones
    # BPF = blade_count * rotation_frequency
    bpf_mask = (freqs >= 80) & (freqs <= 600)
    
    if not bpf_mask.any():
        # No energy in BPF range - fallback to conservative estimate
        return {
            "distance_m": 100.0,
            "ci": [50.0, 200.0],
            "confidence": 0.1,
            "bpf_hz": 200.0
        }
    
    bpf_freqs = freqs[bpf_mask]
    bpf_mags = magnitudes[bpf_mask]
    bpf_idx = np.argmax(bpf_mags)
    bpf_hz = bpf_freqs[bpf_idx]
    bpf_level = bpf_mags[bpf_idx]
    
    # 3. Find 2nd harmonic (within ±10 Hz tolerance)
    # 2nd harmonic often has significant energy for rotating machinery
    harmonic2_hz = 2 * bpf_hz
    harmonic_mask = (freqs >= harmonic2_hz - 10) & (freqs <= harmonic2_hz + 10)
    
    if harmonic_mask.any():
        harmonic2_level = np.max(magnitudes[harmonic_mask])
    else:
        harmonic2_level = 0.0
    
    # 4. Sum levels (linear sum of amplitudes)
    total_level = bpf_level + harmonic2_level
    
    # 5. Convert to dB scale
    # Add small epsilon to avoid log(0)
    L_measured = 20 * np.log10(total_level + 1e-9)
    
    # 6. Get calibration parameters for this drone class
    drone_calib = calibration.get("drone_classes", {}).get(drone_class, {})
    L0 = drone_calib.get("L0", 80.0)  # Default: 80 dB SPL at 1 meter
    r0 = 1.0  # Reference distance (meters)
    
    # 7. Solve inverse square law for distance
    # Simplified formula (ignoring air absorption for MVP):
    #   L_p(r) ≈ L_0 - 20*log10(r/r0)
    #   r = r0 * 10^((L0 - L_measured)/20)
    
    distance_m = r0 * (10 ** ((L0 - L_measured) / 20))
    
    # 8. Clamp to reasonable operational range
    # Minimum: 10m (closer would be visually obvious)
    # Maximum: 1000m (beyond this, audio is too weak/noisy)
    distance_m = float(np.clip(distance_m, 10.0, 1000.0))
    
    # 9. Calculate confidence interval
    # Conservative estimate: ±20% uncertainty (can be refined with calibration data)
    ci_lo = distance_m * 0.8
    ci_hi = distance_m * 1.2
    
    # 10. Confidence score based on BPF peak strength
    # Strong peak = high confidence, weak peak = low confidence
    # Typical strong peak: 2000-5000, weak: <500
    # Normalize to [0, 1] range
    confidence = float(np.clip(bpf_level / 2000.0, 0.0, 1.0))
    
    return {
        "distance_m": distance_m,
        "ci": [float(ci_lo), float(ci_hi)],
        "confidence": confidence,
        "bpf_hz": float(bpf_hz)
    }

