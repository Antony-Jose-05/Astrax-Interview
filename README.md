# 🚀 Astrax Interview — AI-Powered Copilot

A comprehensive suite for real-time interview assistance, featuring automated transcription, resume-to-answer similarity checks, and intelligent follow-up suggestions.

---

## 🏗️ Project Structure

- **`backend/`**: Contains the core Python services.
  - **`AI-Intelligence`**: The LLM engine that analyzes transcripts and detects resume contradictions.
  - **`SSI-Service`**: (Speech-to-Interface) Handles the Whisper-based audio transcription.
  - **`resume parser`**: Extracts and stores vector embeddings of candidate resumes.
- **`extension/`**: The modern browser extension for Google Meet / Zoom.
  - **`interview-copilot`**: WXT-based React frontend with a high-fidelity mixed audio pipeline.

---

## ⚡ Quick Start

### 1. Requirements

- Python 3.10+
- Node.js 18+
- [Groq API Key](https://console.groq.com/keys) (Required for ultra-fast transcription and analysis)

### 2. Backend Setup

You will need three terminals to run the backend services.

#### Terminal 1: SSI-Service (Transcription)
```bash
cd backend/SSI-Service
# create .env with GROQ_API_KEY
pip install -r requirements.txt
uvicorn main:app --port 8000
```

#### Terminal 2: Resume Parser
```bash
cd backend/"resume parser"
# create .env
pip install -r requirements.txt
uvicorn main:app --port 8001
```

#### Terminal 3: AI-Intelligence (Analysis)
```bash
cd backend/AI-Intelligence
# create .env
pip install -r requirements.txt
uvicorn api:app --port 8002
```

### 3. Extension Setup

#### Terminal 4: Frontend
```bash
cd extension/interview-copilot
npm install
npm run dev
```

---

## 🎙️ Best Practices for High Fidelity
- 🎧 **Use Headphones**: Prevents the "Feedback Loop" (computer sound getting back into the mic).
- 🤫 **Quiet Environment**: Reduces Whisper hallucinations (no background TV/videos).
- ✅ **Checkbox**: When sharing your tab, ensure **"Also share tab audio"** is checked in the browser picker.

---

## 📜 Consolidated Requirements
A master `requirements.txt` is provided in the root for convenience:
```bash
pip install -r requirements.txt
```
