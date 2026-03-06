# AI Interview Intelligence Agent

A production-ready AI reasoning layer that analyzes candidate answers in real time.

---

## Architecture

```
resume.json + transcript.txt
         │
         ▼
  ┌─────────────────┐
  │  RAG Context    │  ← Chunks resume, retrieves relevant sections per topic
  │  Builder        │
  └────────┬────────┘
           │
    ┌──────┴────────────────────────────────┐
    │                                       │
    ▼                                       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Follow-Up   │  │ Contradiction │  │   Evaluation     │
│  Generator   │  │  Detector     │  │   Scorer         │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                 │                    │
       └─────────────────┴────────────────────┘
                         │
                         ▼
              Unified Analysis JSON
```

---

## Setup

```bash
pip install openai
export GROQ_API_KEY="gsk_..."   # Get your key at console.groq.com
python demo.py
```

---

## Files

| File | Purpose |
|------|---------|
| `agent.py` | Core analysis engine — prompts + pipeline |
| `rag_context.py` | Resume chunking + keyword retrieval |
| `demo.py` | Sample data runner |
| `example_output.json` | Reference output format |

---

## Prompt Engineering Principles

### 1. Follow-Up Question Generation
**Technique:** Role-play + output constraint + enumerated intent taxonomy

```python
"Generate follow-up questions that:
1. Probe vague or surface-level claims
2. Test depth of knowledge
3. Verify real-world experience
4. Challenge assumptions"
```

**Key:** Always ask for `triggered_by` — forces the model to ground questions
in specific evidence rather than hallucinating new ones.

---

### 2. Contradiction Detection
**Technique:** Evidence-anchored comparison with severity tiers

```python
"Look for contradictions such as:
- Claimed skills not on resume
- Timeline impossibilities
- Ownership/scope inflation"
```

**Key:** Ask for `quote` (exact transcript evidence) to make alerts actionable
and defensible in a hiring review.

---

### 3. Answer Quality Scoring
**Technique:** Multi-dimensional rubric scoring (0–10 per dimension)

```
technical_depth | communication_clarity | problem_solving
experience_relevance | self_awareness
```

**Key:** `self_awareness` is the most differentiating signal — strong candidates
acknowledge limits; inflators don't.

---

## Output JSON Schema

```json
{
  "analysis": {
    "follow_up_questions": [
      {
        "question": "string",
        "intent": "probe_depth | verify_claim | test_edge_case | challenge_assumption",
        "triggered_by": "string"
      }
    ],
    "vagueness_detected": "boolean",
    "vagueness_reason": "string | null",
    "contradiction_alerts": {
      "items": [
        {
          "severity": "high | medium | low",
          "resume_claim": "string",
          "interview_claim": "string",
          "quote": "string",
          "explanation": "string"
        }
      ],
      "count": "integer",
      "consistency_score": "float (0–10)"
    },
    "candidate_evaluation": {
      "scores": {
        "technical_depth": "float",
        "communication_clarity": "float",
        "problem_solving": "float",
        "experience_relevance": "float",
        "self_awareness": "float"
      },
      "overall_score": "float (0–10)",
      "recommendation": "strong_hire | hire | maybe | no_hire",
      "strengths": ["string"],
      "red_flags": ["string"],
      "summary": "string"
    }
  }
}
```

---

## RAG Strategy

For resume-scale documents, **keyword overlap retrieval** is sufficient and fast.
To scale to larger corpora (e.g., portfolios, GitHub, cover letters):

```python
# Swap retrieve_relevant_context() with:
from chromadb import Client
collection.query(query_texts=[topic], n_results=3)
```

---

## Extending the Agent

| Feature | How |
|---------|-----|
| Streaming output | Use `stream=True` in OpenAI call |
| Add more interview rounds | Pass full multi-turn transcript |
| Bias detection | Add a 4th prompt checking for demographic signal leakage |
| Confidence calibration | Add `"confidence": 0.0–1.0` to each contradiction |
| Webhook integration | Wrap `analyze_interview()` in a FastAPI route |
