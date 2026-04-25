# 🚁 Audio-Based Drone Detection & Classification System

An intelligent audio classification system that uses deep learning to detect and identify drones from their acoustic signatures. The system employs a two-stage CNN architecture and physics-based distance estimation to provide real-time drone detection, classification, and localization capabilities.

## 🎯 Features

### Backend (ML & API)
- **Two-Stage Classification Pipeline**
  - Stage 1: Binary classifier (drone vs. non-drone)
  - Stage 2: Multi-class classifier (10 drone types: A-J)
- **ResNet-Inspired CNN Architecture** with residual blocks for robust audio feature extraction
- **Distance Estimation** using Blade-Pass Frequency (BPF) analysis and inverse square law physics
- **Real-Time Inference** with GPU acceleration via Modal.com serverless deployment
- **Feature Visualization** including spectrograms and activation maps
- **RESTful API** built with FastAPI

### Frontend (Interactive Dashboard)
- **Interactive Map Interface** with Mapbox/Leaflet for drone position visualization
- **Real-Time Audio Upload** and processing
- **Detection Visualization** with circular radius indicators
- **Prediction Logs** with confidence scores and timestamps
- **Operator Analytics Dashboard** for monitoring detection performance
- **Range and Bearing Calculations** from user location to detected drones
- **Mobile-Responsive Design** with Shadcn UI and Tailwind CSS

## 🏗️ Architecture

### Backend Stack
- **Framework**: PyTorch 2.0+ with TorchAudio
- **Deployment**: Modal.com (serverless GPU: A10G)
- **API**: FastAPI with CORS support
- **Audio Processing**: Librosa, SoundFile
- **Model**: Custom ResNet-34 inspired CNN with 4 residual layers

### Frontend Stack
- **Framework**: Next.js 15 (React 19) with TypeScript
- **Styling**: Tailwind CSS 4 + Shadcn UI + Radix UI
- **Maps**: Mapbox GL / Leaflet with Turf.js for geospatial calculations
- **State Management**: React hooks with URL state via nuqs
- **Deployment**: Netlify (configured via `netlify.toml`)

## 📦 Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- Modal account (for backend deployment)
- Mapbox API key (for frontend maps)

### Backend Setup

cd backend

# Install dependencies
pip install -r requirements.txt

# Set up Modal CLI
modal token new

# Deploy the API
modal deploy main.py### Frontend Setup

cd frontend

# Install dependencies
npm install

# Create .env.local with your API keys
echo "NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token" > .env.local
echo "NEXT_PUBLIC_API_URL=your_modal_api_url" >> .env.local

# Run development server
npm run dev## 🚀 Usage

### Training the Model

cd backend

# Train binary classifier (stage 1)
python train_binary.py

# Train multi-class classifier (stage 2)
python train.py

# Test the trained model
python test_model.py### Running Inference

#### Via API
# Deploy to Modal
modal deploy main.py

# Test with audio file
curl -X POST https://your-modal-url.modal.run \
  -F "file=@audio_sample.wav"#### Via Frontend
1. Open the web application
2. Click "Upload Audio" in the left sidebar
3. Select a `.wav` file
4. View results on the map and analytics panel

