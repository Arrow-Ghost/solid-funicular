# solid-funicular // AgentX Vision

> Real-Time YOLO Camera Object Detection & Voice Assistant (30+ FPS) with Dual-Engine Gemini Multimodal AI.

AgentX Vision is an AR Vision application that connects to your device's live camera feed, continuously scans the environment using **Real-Time On-Device YOLO** (30+ FPS via WebGL) or **Google Gemini Vision**, and categorizes objects around you into **Living** and **Non-Living** entities with glowing 2D bounding boxes. It features an interactive Voice Agent that listens for spoken commands (e.g. *"Where is the bottle?"*, *"Find the person"*, *"Identify the plant"*), locks onto target objects with a golden spotlight reticle, and speaks natural answers aloud.

---

## ✨ Features

- ⚡ **Real-Time On-Device YOLO Detection (30+ FPS)**: Runs locally on your device GPU via WebGL—zero cloud API costs, zero rate limits, and 100% offline capability.
- 📹 **Live WebRTC Camera Feed**: Seamless video streaming with front/rear camera switching, auto-orientation, and freeze-frame controls.
- 🌿 **Living vs Non-Living Categorization**: Automatically tags 80+ everyday objects:
  - 🟢 **Living Organisms**: Humans, pets, plants, flowers, animals, birds.
  - 🔵 **Non-Living Items**: Laptops, phones, mugs, bottles, chairs, backpacks, books, tools, cutlery.
- 🎙️ **Interactive Voice Commands with 0ms Target Search**:
  - *"Where is the [object]?"* / *"Find the [object]"* (e.g. *"Where is the bottle?"*)
  - *"Identify the [object]"* (e.g. *"Identify the plant"*)
  - *"What is in front of me?"* / *"Describe scene"*
  - *"Scan now"* / *"Show living things only"*
- 🗣️ **Speech Synthesis (TTS)**: Spoken voice audio responses explaining where items are situated in your view.
- 🎯 **Target Lock Spotlight Reticle**: Animated pulsing reticle that spotlights targeted items.
- 🔄 **Dual-Engine Architecture**: One-click toggle between **⚡ YOLO (30 FPS On-Device)** and **🧠 Gemini Flash (Cloud Multimodal)**.
- 📊 **Scene Telemetry Drawer**: Live counters (Total, Living, Non-Living) with filterable object cards and quick-tap query prompts.
- 🐍 **Standalone Python YOLO Script** (`yolo_desktop.py`): Native desktop OpenCV feed powered by Ultralytics YOLOv8.
- 🎮 **Demo Simulator Mode**: Graceful simulated cyber-room fallback if camera hardware is unavailable or permissions are denied.
- 🔊 **Procedural Web Audio SFX**: High-tech radar sweep and lock-on audio cues synthesized with pure Web Audio API.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- Google Gemini API Key

### Installation

```bash
# Clone the repository
git clone https://github.com/Arrow-Ghost/solid-funicular.git
cd solid-funicular

# Install dependencies
npm install

# Start the local development server
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) in Google Chrome or Microsoft Edge.

---

## 🛠️ Tech Stack

- **Core**: Vanilla JavaScript (ES Modules), HTML5
- **Styling**: Modern Vanilla CSS (Cyber AR HUD design system, Glassmorphism)
- **AI Models**: Google Gemini 3.6 Flash / 3.7 Flash Multimodal Vision API
- **Audio & Voice**: Web Speech Recognition API, SpeechSynthesis API, Web Audio API
- **Dev & Build**: Vite v8

---

## 📄 License

MIT License.
