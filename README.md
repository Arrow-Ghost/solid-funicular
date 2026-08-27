# solid-funicular // AgentX Vision

> Live Camera Feed Object Detection & Voice Assistant powered by Google Gemini Vision and Web Speech API.

AgentX Vision is an AR Vision web application that connects to your device's live camera feed, continuously scans the environment, and categorizes objects around you into **Living** and **Non-Living** entities with real-time 2D bounding boxes. It includes an interactive Voice Agent that listens for spoken commands (e.g. *"Where is the bottle?"*, *"Identify the plant"*, *"What is in front of me?"*), locks onto target objects with a glowing reticle, and speaks natural answers aloud.

---

## ✨ Features

- 📹 **Live WebRTC Camera Feed**: Seamless video streaming with front/rear camera switching, auto-orientation, and freeze-frame controls.
- 🤖 **Gemini Multimodal Object Detection**: Powered by `gemini-3.6-flash` / `gemini-3.7-flash`, returning structured 2D bounding box coordinates `[ymin, xmin, ymax, xmax]` normalized to 1000.
- 🌿 **Living vs Non-Living Categorization**:
  - 🟢 **Living Organisms**: Humans, pets, plants, flowers, animals, insects.
  - 🔵 **Non-Living Items**: Laptops, phones, mugs, bottles, furniture, tools, accessories.
- 🎙️ **Interactive Voice Commands**:
  - *"Where is the [object]?"* / *"Find the [object]"*
  - *"Identify the [object]"*
  - *"What is in front of me?"* / *"Describe scene"*
  - *"Scan now"* / *"Show living things only"*
- 🗣️ **Speech Synthesis (TTS)**: Spoken voice audio responses explaining where items are situated in your view.
- 🎯 **Target Lock Spotlight Reticle**: Animated pulsing reticle that spotlights targeted items.
- 📊 **Scene Telemetry Drawer**: Live counters (Total, Living, Non-Living) with filterable object cards and quick-tap query prompts.
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
