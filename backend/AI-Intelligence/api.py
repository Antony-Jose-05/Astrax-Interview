"""
api.py — FastAPI endpoint to expose the AI Interview Intelligence Agent.
Run:  uvicorn api:app --reload --port 8000
"""

import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from agent import analyze_interview

print(f"[AI-Intelligence] GROQ_API_KEY loaded: {'Yes' if os.getenv('GROQ_API_KEY') else 'No'}")

# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────

app = FastAPI(
    title="Astrax Interview — AI Intelligence API",
    description="Analyzes interview transcripts against resumes to generate follow-ups, detect contradictions, and score candidates.",
    version="1.0.0",
)

@app.get("/")
def root():
    return {"message": "AI Intelligence API is running"}


# Allow CORS for the Chrome extension and local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your extension's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """Request body for the /analyze-answer endpoint."""
    transcript: str = Field(..., description="Full interview transcript with Interviewer:/Candidate: prefixes")
    resume: dict = Field(..., description="Parsed resume as a JSON object")
    latest_answer: Optional[str] = Field(None, description="The candidate's most recent answer. If omitted, extracted from the transcript.")
    topic: Optional[str] = Field("general", description="Current interview topic (e.g., 'system design', 'database migrations')")
    role: Optional[str] = Field("Software Engineer", description="Role the candidate is interviewing for")


class AnalyzeResponse(BaseModel):
    """Response body matching the extension's AnalyzeAnswerResponse interface.
    Flat shape: { follow_up_questions: any[], contradictions: any[], score: number }
    """
    follow_up_questions: list[dict]
    contradictions: list[dict]
    score: float


class HealthResponse(BaseModel):
    status: str
    service: str


# ─────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────

def extract_latest_answer(transcript: str) -> str:
    """Extract the latest part of the conversation. 
    Handles both prefixed (Candidate:) and mixed transcripts.
    """
    lines = transcript.strip().split("\n")
    
    # Try prefixed extraction first
    candidate_lines = []
    capturing = False
    for line in reversed(lines):
        stripped = line.strip()
        if stripped.startswith("Candidate:"):
            candidate_lines.insert(0, stripped.replace("Candidate:", "").strip())
            capturing = True
        elif stripped.startswith("Interviewer:") and capturing:
            break
        elif capturing and stripped:
            candidate_lines.insert(0, stripped)

    # If prefixes are missing or sparse, use a window
    if not candidate_lines or len(candidate_lines) < 2:
        return transcript[-1000:].strip() # Take a larger window for mixed audio
    
    return " ".join(candidate_lines)




def flatten_response(analysis: dict) -> dict:
    """Pass through the structured evaluation into the shape expected."""
    follow_ups = analysis.get("follow_up_questions", [])
    
    alerts = analysis.get("contradiction_alerts", {})
    contradiction_items = alerts.get("items", [])

    evaluation = analysis.get("candidate_evaluation", {})
    score = evaluation.get("overall_score", 0.0)

    return {
        "follow_up_questions": follow_ups,
        "contradictions": contradiction_items,
        "score": score,
    }


# ─────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "ai-intelligence"}


@app.post("/analyze-answer", response_model=AnalyzeResponse)
def analyze_answer(request: AnalyzeRequest):
    """
    Analyze a candidate's interview performance.

    Runs the full AI pipeline:
    1. Follow-up question generation (with RAG context)
    2. Contradiction detection (resume vs transcript)
    3. Candidate evaluation scoring

    Returns flat shape matching extension's AnalyzeAnswerResponse:
    { follow_up_questions: string[], contradictions: string[], score: number }
    """
    # Use provided latest_answer, or extract it from transcript
    latest_answer = request.latest_answer or extract_latest_answer(request.transcript)

    print(f"[AI-Intelligence] Analyzing transcript (length: {len(request.transcript)})...")
    result = analyze_interview(
        resume=request.resume,
        transcript=request.transcript,
        latest_answer=latest_answer,
        topic=request.topic or "general",
        role=request.role or "Software Engineer",
    )
    print(f"[AI-Intelligence] Analysis complete. Score: {result.get('analysis', {}).get('candidate_evaluation', {}).get('overall_score', 'N/A')}")

    # If agent returned a validation error
    if "error" in result:
        raise HTTPException(status_code=422, detail=result)

    # Flatten nested analysis → flat shape for extension
    flat = flatten_response(result["analysis"])
    return AnalyzeResponse(**flat)
