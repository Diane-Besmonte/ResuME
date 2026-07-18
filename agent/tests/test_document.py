from pathlib import Path
from zipfile import ZipFile

from app.document import build_docx
from app.main import compatibility_score
from app.models import CandidateProfile, RequirementMatch, ResumeDraft


def test_docx_contains_grounded_resume(tmp_path: Path):
    profile = CandidateProfile(name="Alex Morgan", email="alex@example.com")
    resume = ResumeDraft(
        professional_summary="Python developer building accessible web products.",
        skills=["Python", "FastAPI"],
        experience=[],
        projects=[],
        education=[],
        certifications=[],
        requirement_matches=[
            RequirementMatch(requirement="Python", status="matched", evidence="Resume", source="existing_resume"),
            RequirementMatch(requirement="AWS", status="not_found", evidence="", source=""),
        ],
    )
    output = tmp_path / "resume.docx"

    build_docx(profile, resume, output)

    with ZipFile(output) as archive:
        document_xml = archive.read("word/document.xml").decode()
    assert "ALEX MORGAN" in document_xml
    assert "Python developer" in document_xml
    assert compatibility_score(resume.requirement_matches) == 50
