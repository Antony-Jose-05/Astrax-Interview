"""
api.py — FastAPI endpoint to expose the AI Interview Intelligence Agent.
Run:  uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from agent import analyze_interview

# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────

app = FastAPI(
    title="Astrax Interview — AI Intelligence API",
    description="Analyzes interview transcripts against resumes to generate follow-ups, detect contradictions, and score candidates.",
    version="1.0.0",
)

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
    """Response body from the /analyze-answer endpoint."""
    analysis: dict


class HealthResponse(BaseModel):
    status: str
    service: str


# ─────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────

def extract_latest_answer(transcript: str) -> str:
    """Extract the last Candidate response from the transcript."""
    lines = transcript.strip().split("\n")
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

    return " ".join(candidate_lines) if candidate_lines else transcript[-500:]


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
    """
    # Use provided latest_answer, or extract it from transcript
    latest_answer = request.latest_answer or extract_latest_answer(request.transcript)

    result = analyze_interview(
        resume=request.resume,
        transcript=request.transcript,
        latest_answer=latest_answer,
        topic=request.topic or "general",
        role=request.role or "Software Engineer",
    )

    # If agent returned a validation error
    if "error" in result:
        raise HTTPException(status_code=422, detail=result)

    return AnalyzeResponse(analysis=result["analysis"])
