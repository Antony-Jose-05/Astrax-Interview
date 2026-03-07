"""
AI Interview Intelligence Agent
Analyzes candidate answers, detects contradictions, generates follow-ups, scores quality.
"""

import json
import os
import logging
from openai import OpenAI
from typing import Any
from dotenv import load_dotenv
from rag_context import build_rag_context

load_dotenv()

MODEL = "llama-3.3-70b-versatile"
_client = None


def get_client() -> OpenAI:
    """Lazy-initialize the OpenAI/Groq client on first use."""
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            print("[AI-Intelligence] GROQ_API_KEY NOT FOUND in agent.py environment!")
            raise ValueError("GROQ_API_KEY environment variable is not set")
        
        # Log masked key for verification
        masked = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "****"
        print(f"[AI-Intelligence] GROQ_API_KEY available in agent.py: {masked}")
        
        _client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    return _client


# ─────────────────────────────────────────────
# PROMPT TEMPLATES
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert technical interviewer and talent evaluator.
You are analyzing a LIVE INTERVIEW transcript which is a MIX of both the Interviewer and the Candidate. 
Your first critical task is to CONTEXTUALLY ATTRIBUTE each statement:
- Questions and guidance are from the INTERVIEWER.
- Technical explanations and project descriptions are from the CANDIDATE (INTERVIEWEE).

Your job is to support the Interviewer by:
1. Detecting inconsistencies between what the Candidate says and their Resume.
2. Generating smart follow-up questions for the Interviewer to ask.
3. Evaluating the candidate's performance.

Always respond with valid JSON only."""


FOLLOWUP_PROMPT = """You are conducting a technical interview. Analyze the candidate's latest answer and generate intelligent follow-up questions.

RESUME CONTEXT:
{resume_summary}

INTERVIEW TRANSCRIPT (MIXED SPEAKERS):
{transcript}

LATEST PART OF CONVERSATION:
{latest_answer}

CURRENT QUESTION TOPIC: {topic}

Generate follow-up questions that:
1. Probe vague or surface-level claims ("Tell me more about X")
2. Test depth of knowledge ("How would you handle edge case Y?")
3. Verify real-world experience ("Walk me through a specific example")
4. Challenge assumptions ("What tradeoffs did you consider?")

Return this exact JSON:
{{
  "follow_up_questions": [
    {{
      "question": "string",
      "intent": "probe_depth | verify_claim | test_edge_case | challenge_assumption",
      "triggered_by": "exact phrase from answer that prompted this question"
    }}
  ],
  "vagueness_detected": true | false,
  "vagueness_reason": "string or null"
}}"""


CONTRADICTION_PROMPT = """You are a resume verification expert. Compare the candidate's interview answers against their resume for inconsistencies.

CANDIDATE RESUME:
{resume_json}

INTERVIEW TRANSCRIPT (MIXED SPEAKERS):
{transcript}

Look for contradictions such as:
- Claimed skills/technologies not listed on resume
- Date/timeline inconsistencies (overlapping roles, impossible timelines)
- Role/title mismatches (claiming senior work when resume shows junior)
- Project ownership discrepancies ("I built X alone" vs resume shows team)
- Technology version/stack conflicts

Return this exact JSON:
{{
  "contradictions": [
    {{
      "severity": "high | medium | low",
      "resume_claim": "what the resume states",
      "interview_claim": "what the candidate said in the interview",
      "quote": "exact quote from transcript",
      "explanation": "why this is contradictory"
    }}
  ],
  "contradiction_count": 0,
  "overall_consistency_score": 0.0
}}"""


EVALUATION_PROMPT = """You are a senior technical hiring manager scoring a candidate's interview performance.

ROLE BEING INTERVIEWED FOR: {role}

RESUME:
{resume_json}

FULL INTERVIEW TRANSCRIPT:
{transcript}

Score the candidate across these dimensions (0.0–10.0 each):

1. technical_depth — Demonstrates deep understanding, not just surface knowledge
2. communication_clarity — Answers are structured, clear, and concise
3. problem_solving — Shows logical reasoning and systematic thinking
4. experience_relevance — Experience aligns with the role requirements
5. self_awareness — Acknowledges limitations, growth areas, and failures honestly

Return this exact JSON:
{{
  "scores": {{
    "technical_depth": 0.0,
    "communication_clarity": 0.0,
    "problem_solving": 0.0,
    "experience_relevance": 0.0,
    "self_awareness": 0.0
  }},
  "overall_score": 0.0,
  "recommendation": "strong_hire | hire | maybe | no_hire",
  "strengths": ["string"],
  "red_flags": ["string"],
  "summary": "2-3 sentence hiring manager summary"
}}"""


# ─────────────────────────────────────────────
# HELPER: Call OpenAI and parse JSON
# ─────────────────────────────────────────────

logger = logging.getLogger(__name__)


def call_llm(prompt: str, temperature: float = 0.3) -> dict[str, Any]:
    """Call Groq LLM and return parsed JSON response. Handles API and parsing errors."""
    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        raw = response.choices[0].message.content
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"LLM returned invalid JSON: {e}")
        return {"error": "LLM response was not valid JSON", "raw": raw}
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return {"error": str(e)}


def summarize_resume(resume: dict) -> str:
    """Flatten resume to a readable summary for prompt injection."""
    lines = []
    if name := (resume.get("full_name") or resume.get("name")):
        lines.append(f"Candidate: {name}")
    if title := (resume.get("current_job_title") or resume.get("title")):
        lines.append(f"Current Title: {title}")
    
    skill_list = []
    skill_list.extend(resume.get("skills", []))
    skill_list.extend(resume.get("programming_languages", []))
    if skill_list:
        lines.append(f"Skills: {', '.join(skill_list)}")
        
    exp = resume.get("experience") or resume.get("past_companies") or []
    if exp:
        lines.append("Experience:")
        for job in exp:
            if isinstance(job, dict):
                lines.append(f"  - {job.get('title') or job.get('role')} at {job.get('company')}")
            else:
                lines.append(f"  - {job}")
    return "\n".join(lines)


# ─────────────────────────────────────────────
# CORE FUNCTIONS
# ─────────────────────────────────────────────

def generate_followup_questions(
    resume: dict,
    transcript: str,
    latest_answer: str,
    topic: str = "general"
) -> dict:
    """Generate intelligent follow-up questions based on candidate's latest answer.
    Uses RAG to inject only the most relevant resume context."""
    # RAG: retrieve only the resume sections relevant to the current topic
    rag_context = build_rag_context(resume, topic + " " + latest_answer)
    resume_summary = summarize_resume(resume) + "\n\nRelevant Resume Context:\n" + rag_context

    prompt = FOLLOWUP_PROMPT.format(
        resume_summary=resume_summary,
        transcript=transcript,
        latest_answer=latest_answer,
        topic=topic,
    )
    return call_llm(prompt, temperature=0.5)


def detect_contradictions(resume: dict, transcript: str) -> dict:
    """Detect inconsistencies between resume claims and interview answers."""
    prompt = CONTRADICTION_PROMPT.format(
        resume_json=json.dumps(resume, indent=2),
        transcript=transcript,
    )
    return call_llm(prompt, temperature=0.1)


def evaluate_candidate(resume: dict, transcript: str, role: str = "Software Engineer") -> dict:
    """Produce a structured evaluation score for the candidate."""
    prompt = EVALUATION_PROMPT.format(
        role=role,
        resume_json=json.dumps(resume, indent=2),
        transcript=transcript,
    )
    return call_llm(prompt, temperature=0.2)


# ─────────────────────────────────────────────
# ORCHESTRATOR — Full Analysis Pipeline
# ─────────────────────────────────────────────

def validate_inputs(resume: dict, transcript: str, latest_answer: str) -> list[str]:
    """Validate inputs before running the pipeline. Returns list of error messages."""
    errors = []
    if not resume or not isinstance(resume, dict):
        errors.append("Resume must be a non-empty dictionary")
    if not transcript or not transcript.strip():
        errors.append("Transcript must be a non-empty string")
    if not latest_answer or not latest_answer.strip():
        errors.append("Latest answer must be a non-empty string")
    return errors


def analyze_interview(
    resume: dict,
    transcript: str,
    latest_answer: str,
    topic: str = "general",
    role: str = "Software Engineer",
) -> dict:
    """
    Run the complete interview analysis pipeline.

    Returns a unified JSON with:
    - follow_up_questions
    - contradiction_alerts
    - candidate_evaluation
    """
    # Validate inputs
    errors = validate_inputs(resume, transcript, latest_answer)
    if errors:
        return {"error": "Invalid inputs", "details": errors}

    followups = generate_followup_questions(resume, transcript, latest_answer, topic)
    contradictions = detect_contradictions(resume, transcript)
    evaluation = evaluate_candidate(resume, transcript, role)

    return {
        "analysis": {
            "follow_up_questions": followups.get("follow_up_questions", []),
            "vagueness_detected": followups.get("vagueness_detected", False),
            "vagueness_reason": followups.get("vagueness_reason"),
            "contradiction_alerts": {
                "items": contradictions.get("contradictions", []),
                "count": contradictions.get("contradiction_count", 0),
                "consistency_score": contradictions.get("overall_consistency_score", 10.0),
            },
            "candidate_evaluation": {
                "scores": evaluation.get("scores", {}),
                "overall_score": evaluation.get("overall_score", 0.0),
                "recommendation": evaluation.get("recommendation", "maybe"),
                "strengths": evaluation.get("strengths", []),
                "red_flags": evaluation.get("red_flags", []),
                "summary": evaluation.get("summary", ""),
            },
        }
    }
