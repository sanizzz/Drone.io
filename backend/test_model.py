"""
Test script to verify drone models are working correctly
"""
import torch
from model import AudioCNN
import sys

def test_model_loading():
    """Test if models can be loaded and inspected"""
    print("=" * 60)
    print("DRONE MODEL TESTING SCRIPT")
    print("=" * 60)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n✓ Device: {device}")
    
    # Test 1: Load Binary Model
    print("\n" + "=" * 60)
    print("TEST 1: Binary Model (Drone vs Not-Drone)")
    print("=" * 60)
    try:
        binary_checkpoint = torch.load('/models/binary_model.pth', map_location=device)
        print("✓ Binary model file loaded successfully")
        
        # Check what's in the checkpoint
        print(f"\n📦 Checkpoint contents:")
        for key in binary_checkpoint.keys():
            print(f"  - {key}")
        
        # Get model info
        if 'classes' in binary_checkpoint:
            print(f"\n📊 Classes: {binary_checkpoint['classes']}")
        if 'accuracy' in binary_checkpoint:
            print(f"📊 Accuracy: {binary_checkpoint['accuracy']:.2f}%")
        if 'epoch' in binary_checkpoint:
            print(f"📊 Trained epochs: {binary_checkpoint['epoch']}")
            
        # Try to load model
        binary_model = AudioCNN(num_classes=2)
        binary_model.load_state_dict(binary_checkpoint['model_state_dict'])
        binary_model.to(device)
        binary_model.eval()
        print("\n✅ Binary model loaded and ready!")
        
    except FileNotFoundError:
        print("❌ ERROR: /models/binary_model.pth not found!")
        print("   Make sure you've trained the binary model first")
        return False
    except Exception as e:
        print(f"❌ ERROR loading binary model: {e}")
        return False
    
    # Test 2: Load Multi-class Model
    print("\n" + "=" * 60)
    print("TEST 2: Multi-class Model (Drone Types)")
    print("=" * 60)
    try:
        multiclass_checkpoint = torch.load('/models/best_model.pth', map_location=device)
        print("✓ Multi-class model file loaded successfully")
        
        # Check what's in the checkpoint
        print(f"\n📦 Checkpoint contents:")
        for key in multiclass_checkpoint.keys():
            print(f"  - {key}")
        
        # Get model info
        if 'classes' in multiclass_checkpoint:
            classes = multiclass_checkpoint['classes']
            print(f"\n📊 Number of classes: {len(classes)}")
            print(f"📊 Classes: {classes}")
        if 'accuracy' in multiclass_checkpoint:
            print(f"📊 Accuracy: {multiclass_checkpoint['accuracy']:.2f}%")
        if 'epoch' in multiclass_checkpoint:
            print(f"📊 Trained epochs: {multiclass_checkpoint['epoch']}")
            
        # Try to load model
        multiclass_model = AudioCNN(num_classes=len(classes))
        multiclass_model.load_state_dict(multiclass_checkpoint['model_state_dict'])
        multiclass_model.to(device)
        multiclass_model.eval()
        print("\n✅ Multi-class model loaded and ready!")
        
    except FileNotFoundError:
        print("❌ ERROR: /models/best_model.pth not found!")
        print("   Make sure you've trained the model first")
        return False
    except Exception as e:
        print(f"❌ ERROR loading multi-class model: {e}")
        return False
    
    # Test 3: Test inference with dummy data
    print("\n" + "=" * 60)
    print("TEST 3: Inference Test (Dummy Data)")
    print("=" * 60)
    try:
        # Create dummy spectrogram (batch=1, channels=1, height=128, width=215)
        dummy_input = torch.randn(1, 1, 128, 215).to(device)
        print(f"✓ Created dummy input: {dummy_input.shape}")
        
        # Test binary model
        with torch.no_grad():
            binary_output = binary_model(dummy_input)
            binary_probs = torch.softmax(binary_output, dim=1)
            print(f"\n🔍 Binary model output shape: {binary_output.shape}")
            print(f"🔍 Binary probabilities: {binary_probs[0].cpu().numpy()}")
            print(f"🔍 Predicted class: {binary_checkpoint['classes'][torch.argmax(binary_probs[0]).item()]}")
        
        # Test multiclass model
        with torch.no_grad():
            multiclass_output = multiclass_model(dummy_input)
            multiclass_probs = torch.softmax(multiclass_output, dim=1)
            top3_probs, top3_indices = torch.topk(multiclass_probs[0], 3)
            
            print(f"\n🔍 Multi-class model output shape: {multiclass_output.shape}")
            print(f"🔍 Top 3 predictions:")
            for prob, idx in zip(top3_probs, top3_indices):
                print(f"   - {classes[idx.item()]}: {prob.item():.2%}")
        
        print("\n✅ Both models can perform inference!")
        
    except Exception as e:
        print(f"❌ ERROR during inference test: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED!")
    print("=" * 60)
    print("\nYour models are working correctly!")
    print("If you're still not getting predictions in the frontend,")
    print("the issue is likely with:")
    print("  1. API connection (check NEXT_PUBLIC_BACKEND_API_URL)")
    print("  2. Audio preprocessing")
    print("  3. Network/CORS issues")
    return True


if __name__ == "__main__":
    success = test_model_loading()
    sys.exit(0 if success else 1)

