"""
demo.py — Run the Interview Intelligence Agent with sample data.
Shows the full pipeline: follow-ups + contradictions + scoring.
"""

import json
from agent import analyze_interview

# ─────────────────────────────────────────────
# SAMPLE DATA
# ─────────────────────────────────────────────

SAMPLE_RESUME = {
    "name": "Alex Rivera",
    "title": "Mid-Level Backend Engineer",
    "years_of_experience": 3,
    "skills": ["Python", "Django", "PostgreSQL", "Redis", "Docker"],
    "education": [
        {"degree": "B.S. Computer Science", "school": "State University", "year": 2021}
    ],
    "experience": [
        {
            "title": "Backend Engineer",
            "company": "FinTech Startup",
            "duration": "Jan 2022 – Present",
            "responsibilities": [
                "Worked on REST API development using Django",
                "Participated in code reviews",
                "Assisted in PostgreSQL query optimization"
            ]
        },
        {
            "title": "Junior Developer Intern",
            "company": "Agency Corp",
            "duration": "Jun 2021 – Dec 2021",
            "responsibilities": [
                "Built frontend components in React",
                "Fixed bugs in Python scripts"
            ]
        }
    ]
}

SAMPLE_TRANSCRIPT = """
Interviewer: Tell me about your experience with system design.

Candidate: Sure! I've actually led the design and architecture of our entire 
microservices platform at FinTech Startup. I single-handedly migrated our 
monolith to Kubernetes and designed a distributed caching layer using Redis 
that handles millions of requests per second.

Interviewer: Impressive. What databases have you worked with?

Candidate: Mostly PostgreSQL, but I'm also very strong in Cassandra and MongoDB. 
I've been using Cassandra in production for about 2 years now for our 
time-series data pipeline.

Interviewer: How do you handle database migrations in production?

Candidate: We use Alembic for Django. I mean, we use it for our Flask app.
We have zero-downtime deploys and I wrote all the migration tooling myself.

Interviewer: What's your experience with AWS?

Candidate: Extensive. I'm AWS Solutions Architect certified and I've architected 
multi-region deployments, designed VPC networking from scratch, and managed 
IAM policies across the organization.
"""

LATEST_ANSWER = """
We use Alembic for Django. I mean, we use it for our Flask app.
We have zero-downtime deploys and I wrote all the migration tooling myself.
"""


def run_demo():
    print("=" * 60)
    print("  AI INTERVIEW INTELLIGENCE AGENT — DEMO RUN")
    print("=" * 60)
    print("\n⚙️  Running full analysis pipeline...")
    print("   (This calls OpenAI API — ensure OPENAI_API_KEY is set)\n")

    result = analyze_interview(
        resume=SAMPLE_RESUME,
        transcript=SAMPLE_TRANSCRIPT,
        latest_answer=LATEST_ANSWER,
        topic="database migrations",
        role="Senior Backend Engineer",
    )

    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    run_demo()
