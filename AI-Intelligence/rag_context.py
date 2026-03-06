"""
rag_context.py — Resume RAG layer.
Chunks resume into retrievable segments and injects relevant context
into prompts based on the current interview topic.
"""

from dataclasses import dataclass


@dataclass
class ResumeChunk:
    section: str       # e.g. "experience", "skills", "education"
    content: str       # text representation
    keywords: list[str]


def build_resume_chunks(resume: dict) -> list[ResumeChunk]:
    """Break resume into tagged, retrievable chunks."""
    chunks = []

    # Skills chunk
    if skills := resume.get("skills"):
        chunks.append(ResumeChunk(
            section="skills",
            content=f"Technical skills listed on resume: {', '.join(skills)}",
            keywords=[s.lower() for s in skills],
        ))

    # Experience chunks (one per job)
    for job in resume.get("experience", []):
        title = job.get("title", "")
        company = job.get("company", "")
        duration = job.get("duration", "")
        responsibilities = " | ".join(job.get("responsibilities", []))
        content = (
            f"Role: {title} at {company} ({duration}). "
            f"Responsibilities: {responsibilities}"
        )
        keywords = [
            w.lower() for w in
            (title + " " + responsibilities).split()
            if len(w) > 3
        ]
        chunks.append(ResumeChunk(
            section="experience",
            content=content,
            keywords=keywords,
        ))

    # Education chunk
    for edu in resume.get("education", []):
        content = f"{edu.get('degree')} from {edu.get('school')} ({edu.get('year')})"
        chunks.append(ResumeChunk(
            section="education",
            content=content,
            keywords=["education", "degree", "university", "school"],
        ))

    return chunks


def retrieve_relevant_context(
    chunks: list[ResumeChunk],
    query: str,
    top_k: int = 3
) -> str:
    """
    Simple keyword-overlap retrieval (no embeddings needed for resume-scale data).
    For larger corpora, swap this with a vector store (FAISS, Chroma, Pinecone).
    """
    query_words = set(query.lower().split())

    scored: list[tuple[float, ResumeChunk]] = []
    for chunk in chunks:
        overlap = len(query_words & set(chunk.keywords))
        # Boost experience section slightly
        boost = 1.2 if chunk.section == "experience" else 1.0
        scored.append((overlap * boost, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [chunk.content for _, chunk in scored[:top_k]]

    return "\n".join(f"[{i+1}] {c}" for i, c in enumerate(top))


def build_rag_context(resume: dict, topic: str) -> str:
    """One-call convenience function: build chunks and retrieve for a topic."""
    chunks = build_resume_chunks(resume)
    return retrieve_relevant_context(chunks, topic)


# ─────────────────────────────────────────────
# ENHANCED AGENT INTEGRATION EXAMPLE
# ─────────────────────────────────────────────

def generate_followup_with_rag(agent_module, resume: dict, transcript: str,
                                latest_answer: str, topic: str) -> dict:
    """
    Augments the follow-up generation by injecting only the
    most relevant resume chunks, reducing token usage and improving precision.
    """
    relevant_context = build_rag_context(resume, topic + " " + latest_answer)

    # Inject retrieved context into the resume field
    augmented_resume = dict(resume)
    augmented_resume["_rag_relevant_context"] = relevant_context

    return agent_module.generate_followup_questions(
        resume=augmented_resume,
        transcript=transcript,
        latest_answer=latest_answer,
        topic=topic,
    )
