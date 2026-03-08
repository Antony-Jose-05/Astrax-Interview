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

### 1. Mandatory: Install Dependencies
Run this in the root folder before starting:
```bash
pip install -r requirements.txt
```

### 2. Startup Guide (One-Liners)

Open **4 Terminals** in the root directory:

#### Terminal 1: SSI-Service (Transcription)
```bash
cd backend/SSI-Service && uvicorn main:app --port 8000 --reload
```

#### Terminal 2: Resume Parser (Uploads)
```bash
cd backend/resume_parser && uvicorn main:app --port 8001 --reload
```

#### Terminal 3: AI-Intelligence (Reasoning)
> [!IMPORTANT]
> This uses **api:app** (not main:app).
```bash
cd backend/AI-Intelligence && uvicorn api:app --port 8002 --reload
```

#### Terminal 4: Browser Extension
```bash
cd extension/interview-copilot && npm run dev
```

---

## 🎙️ Native Caption Scraping (New Mode)
To use the new ultra-accurate scraping mode:
1. Join your **Google Meet**.
2. **Turn on Captions (CC)** in the Google Meet bottom bar.
3. Open the Side Panel and click **Start Tracking**.
4. The extension will now capture text instantly with 100% accuracy and speaker diarization.

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
