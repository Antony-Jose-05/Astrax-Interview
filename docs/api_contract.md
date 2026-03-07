# API Contract: Astrax Interview Intelligence

This document defines the communication protocols between the 6 core roles of the system.

## 🎤 1. Speech-to-Text (Role 3)
**Endpoint**: `POST /transcribe`
**Input**: `multipart/form-data` (audio file)
**Output**: 
```json
{
  "transcript": "string",
  "timestamp": 12345678
}
```

## 📄 2. Resume Parsing (Role 4)
**Endpoint**: `POST /parse-resume`
**Input**: `multipart/form-data` (PDF file)
**Output**:
```json
{
  "full_name": "string",
  "skills": ["string"],
  "experience_years": 0,
  "projects": ["string"]
}
```

## 🧠 3. AI Reasoning (Role 5)
**Endpoint**: `POST /analyze-answer`
**Input**: `application/json`
```json
{
  "transcript": "string",
  "resume_data": { ... }
}
```
**Output**:
```json
{
  "followup_questions": ["string"],
  "contradictions": [
    { "type": "string", "confidence": 0.0 }
  ],
  "answer_score": 0.0
}
```

## 🖥 4. Backend Orchestrator (Role 6)
**Endpoint**: `POST /process-interview`
**Input**: `application/json`
```json
{
  "audio_chunk": "binary/base64",
  "resume_id": "string",
  "speaker": "string"
}
```
**Output**:
```json
{
  "transcript": "string",
  "followup_questions": ["string"],
  "alerts": ["string"],
  "candidate_score": 0.0
}
```
> [!NOTE]
> Role 6 calls Role 3 and Role 5 internally to produce this output.
