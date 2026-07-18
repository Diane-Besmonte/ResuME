import logging
import os
from hmac import compare_digest
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import AuthenticationError, RateLimitError

from .agent import tailor_resume
from .document import build_docx
from .models import GenerationRequest

# ponytail: local ephemeral files; use backend-owned object storage for multi-instance deployment.
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "output"))
logger = logging.getLogger(__name__)
bearer = HTTPBearer()
app = FastAPI(title="ResuME Agent API", version="0.1.0")


def require_internal_key(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> None:
    expected = os.getenv("AGENT_API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="AGENT_API_KEY is not configured")
    if not compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Invalid service credential")


def compatibility_score(matches) -> int:
    if not matches:
        return 0
    values = {"matched": 1, "partial": 0.5, "not_found": 0}
    return round(100 * sum(values[item.status] for item in matches) / len(matches))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/resume-generations", dependencies=[Depends(require_internal_key)])
async def generate_resume(body: GenerationRequest):
    if not any([
        body.profile.resume_text.strip(),
        body.profile.background_text.strip(),
        body.profile.cover_letter_text.strip(),
        body.profile.portfolio_text.strip(),
        body.profile.github_repo.strip(),
    ]):
        raise HTTPException(status_code=422, detail="Candidate evidence is required")

    try:
        resume = await tailor_resume(body)
    except AuthenticationError as exc:
        raise HTTPException(status_code=502, detail="OpenAI rejected OPENAI_API_KEY") from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=502, detail="OpenAI quota or rate limit exceeded") from exc
    except Exception as exc:
        logger.exception("Resume generation failed")
        raise HTTPException(status_code=502, detail="Resume generation failed; check agent logs") from exc

    generation_id = uuid4()
    filename = OUTPUT_DIR / f"{generation_id}.docx"
    build_docx(body.profile, resume, filename)

    return {
        "id": str(generation_id),
        "status": "completed",
        "compatibility_score": compatibility_score(resume.requirement_matches),
        "requirement_matches": [item.model_dump() for item in resume.requirement_matches],
        "resume": resume.model_dump(exclude={"requirement_matches"}),
        "docx_url": f"/resume-generations/{generation_id}/resume.docx",
    }


@app.get(
    "/resume-generations/{generation_id}/resume.docx",
    dependencies=[Depends(require_internal_key)],
)
def download_resume(generation_id: UUID):
    filename = OUTPUT_DIR / f"{generation_id}.docx"
    if not filename.is_file():
        raise HTTPException(status_code=404, detail="Generated resume not found")
    return FileResponse(
        filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="tailored-resume.docx",
    )
