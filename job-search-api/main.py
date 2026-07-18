import ipaddress
import json
import os
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from uuid import uuid4

import httpx
import jwt
from docx import Document
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jobspy import scrape_jobs
from jwt import InvalidTokenError
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from pypdf import PdfReader
from sqlalchemy import ForeignKey, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_HOURS = 24

OUTPUT_DIR = Path("output")
UPLOAD_DIR = Path("uploads/resumes")
CAREER_DIR = Path("uploads/career")
GENERATED_DIR = Path("output/resumes")
AGENT_URL = os.getenv("AGENT_URL", "http://127.0.0.1:8001").rstrip("/")
ALLOWED_DOCUMENTS = {"resume", "background", "cover_letter"}
ALLOWED_SUFFIXES = {".pdf", ".docx"}

engine = create_engine(
    "sqlite:///./app.db",
    connect_args={"check_same_thread": False},
)
password_hash = PasswordHash.recommended()
bearer = HTTPBearer()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))

    github_repo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    background: Mapped[str | None] = mapped_column(nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(36), primary_key=True)


class JobScrape(Base):
    __tablename__ = "job_scrapes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class ResumeGeneration(Base):
    __tablename__ = "resume_generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8)


class SignInRequest(BaseModel):
    email: str
    password: str


class AccountPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = None
    github_repo: str | None = None
    portfolio: str | None = None
    background: str | None = None
    cover_letter: str | None = None


class ScrapeRequest(BaseModel):
    search_term: str = Field(min_length=2)
    location: str = "Remote"
    results_wanted: int = Field(default=10, ge=1, le=50)
    country_indeed: str = "USA"
    hours_old: int | None = Field(default=None, ge=1, le=720)


class GenerateResumeRequest(BaseModel):
    job_description: str | None = Field(default=None, max_length=100_000)
    job_url: str | None = Field(default=None, max_length=1000)
    title: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)


class VisibleTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self.hidden += 1

    def handle_endtag(self, tag: str):
        if tag in {"script", "style", "noscript", "svg"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data: str):
        text = " ".join(data.split())
        if not self.hidden and text:
            self.parts.append(text)


def career_document(user_id: int, kind: str) -> Path | None:
    return next(CAREER_DIR.glob(f"{user_id}-{kind}.*"), None)


def extract_document(path: Path) -> str:
    try:
        if path.suffix.lower() == ".pdf":
            text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
        else:
            text = "\n".join(paragraph.text for paragraph in Document(path).paragraphs)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read {path.suffix} document") from exc
    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Document contains no extractable text")
    return text[:100_000]


def store_document(
    content: bytes,
    original_filename: str,
    kind: str,
    user: User,
    session: Session,
) -> None:
    suffix = Path(original_filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Document must be PDF or DOCX")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Document exceeds 5 MB")

    destination = (
        UPLOAD_DIR / f"{uuid4()}{suffix}"
        if kind == "resume"
        else CAREER_DIR / f"{user.id}-{kind}{suffix}"
    )
    temporary = destination.with_name(f".{uuid4()}{suffix}")
    temporary.write_bytes(content)
    try:
        extract_document(temporary)
    except HTTPException:
        temporary.unlink(missing_ok=True)
        raise

    if kind == "resume":
        if user.resume_filename:
            (UPLOAD_DIR / user.resume_filename).unlink(missing_ok=True)
        user.resume_filename = destination.name
    else:
        old_file = career_document(user.id, kind)
        if old_file:
            old_file.unlink(missing_ok=True)
    temporary.replace(destination)
    session.commit()


def validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise HTTPException(status_code=422, detail="Invalid public job URL")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
        public = addresses and all(ipaddress.ip_address(item[4][0]).is_global for item in addresses)
    except (socket.gaierror, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Job URL host could not be resolved") from exc
    if not public:
        raise HTTPException(status_code=422, detail="Job URL must resolve to a public address")


async def scrape_job_url(url: str) -> str:
    current = url
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        for _ in range(4):
            validate_public_url(current)
            try:
                async with client.stream("GET", current, headers={"User-Agent": "ResuME/1.0"}) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            break
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    if "text/html" not in response.headers.get("content-type", ""):
                        raise HTTPException(status_code=422, detail="Job URL must return HTML")
                    chunks = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > 2 * 1024 * 1024:
                            raise HTTPException(status_code=413, detail="Job page exceeds 2 MB")
                        chunks.append(chunk)
                    parser = VisibleTextParser()
                    parser.feed(b"".join(chunks).decode(response.encoding or "utf-8", errors="replace"))
                    text = "\n".join(parser.parts)
                    if len(text) < 50:
                        raise HTTPException(status_code=422, detail="Could not extract enough job details")
                    return text[:100_000]
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail="Could not retrieve job URL") from exc
    raise HTTPException(status_code=422, detail="Job URL redirected too many times")


def get_session():
    with Session(engine) as session:
        yield session


def create_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode(
        {
            "sub": str(user.id),
            "jti": str(uuid4()),
            "exp": expires_at,
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    claims = decode_token(credentials.credentials)

    if session.get(RevokedToken, claims["jti"]):
        raise HTTPException(status_code=401, detail="Token has been signed out")

    user = session.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def account_data(user: User) -> dict:
    background_file = career_document(user.id, "background")
    cover_letter_file = career_document(user.id, "cover_letter")
    return {
        "name": user.name,
        "email": user.email,
        "github_repo": user.github_repo,
        "portfolio": user.portfolio,
        "background": user.background,
        "cover_letter": user.cover_letter,
        "resume_filename": f"resume{Path(user.resume_filename).suffix}" if user.resume_filename else "",
        "background_filename": background_file.name if background_file else "",
        "cover_letter_filename": cover_letter_file.name if cover_letter_file else "",
        "resume_download_url": "/account/resume" if user.resume_filename else None,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    for directory in [OUTPUT_DIR, UPLOAD_DIR, CAREER_DIR, GENERATED_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="ResuME API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "").split(",") if os.getenv("FRONTEND_ORIGINS") else [],
    allow_origin_regex=os.getenv(
        "FRONTEND_ORIGIN_REGEX",
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", status_code=201)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    email = body.email.lower().strip()

    if session.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        name=body.name.strip(),
        email=email,
        password_hash=password_hash.hash(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "account": account_data(user),
    }


@app.post("/auth/sign-in")
def sign_in(body: SignInRequest, session: Session = Depends(get_session)):
    user = session.scalar(
        select(User).where(User.email == body.email.lower().strip())
    )

    if not user or not password_hash.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "account": account_data(user),
    }


@app.post("/auth/sign-out", status_code=204)
def sign_out(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
):
    claims = decode_token(credentials.credentials)
    session.add(RevokedToken(jti=claims["jti"]))
    session.commit()


@app.get("/account")
def get_account(user: User = Depends(get_current_user)):
    return account_data(user)


@app.patch("/account")
def update_account(
    body: AccountPatch,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    updates = body.model_dump(exclude_unset=True)

    if "email" in updates and updates["email"] is not None:
        new_email = updates["email"].lower().strip()
        existing_user = session.scalar(
            select(User).where(User.email == new_email, User.id != user.id)
        )
        if existing_user:
            raise HTTPException(status_code=409, detail="Email already registered")
        updates["email"] = new_email

    for field, value in updates.items():
        setattr(user, field, value)

    session.commit()
    session.refresh(user)
    return account_data(user)


@app.post("/account/documents/{kind}")
async def upload_document(
    kind: str,
    document: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if kind not in ALLOWED_DOCUMENTS:
        raise HTTPException(status_code=404, detail="Unknown document type")
    content = await document.read()
    store_document(content, document.filename or "", kind, user, session)
    return account_data(user)


@app.post("/account/resume")
async def upload_resume(
    resume: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    content = await resume.read()
    store_document(content, resume.filename or "", "resume", user, session)
    return {"message": "Resume uploaded", "resume_download_url": "/account/resume"}


@app.get("/account/resume")
def download_resume(user: User = Depends(get_current_user)):
    if not user.resume_filename:
        raise HTTPException(status_code=404, detail="No resume uploaded")
    path = UPLOAD_DIR / user.resume_filename
    media_type = (
        "application/pdf"
        if path.suffix == ".pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(path, media_type=media_type, filename=f"resume{path.suffix}")


@app.post("/resume-generations")
async def generate_resume(
    body: GenerateResumeRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    description = (body.job_description or "").strip()
    job_url = (body.job_url or "").strip()
    if bool(description) == bool(job_url):
        raise HTTPException(status_code=422, detail="Provide either job_description or job_url")
    if job_url:
        description = await scrape_job_url(job_url)
    elif len(description) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short")

    resume_path = UPLOAD_DIR / user.resume_filename if user.resume_filename else None
    background_path = career_document(user.id, "background")
    cover_letter_path = career_document(user.id, "cover_letter")
    portfolio_text = ""
    if user.portfolio:
        try:
            portfolio_text = await scrape_job_url(user.portfolio)
        except HTTPException:
            pass  # A blocked portfolio should not prevent generation from other evidence.
    resume_text = extract_document(resume_path) if resume_path and resume_path.is_file() else ""
    background_text = extract_document(background_path) if background_path else user.background or ""
    cover_letter_text = (
        extract_document(cover_letter_path) if cover_letter_path else user.cover_letter or ""
    )
    if not any([resume_text, background_text, cover_letter_text, portfolio_text, user.github_repo]):
        raise HTTPException(status_code=422, detail="Add a resume, background document, portfolio, or GitHub repository first")

    payload = {
        "profile": {
            "name": user.name,
            "email": user.email,
            "github_repo": user.github_repo or "",
            "portfolio": user.portfolio or "",
            "portfolio_text": portfolio_text,
            "resume_text": resume_text,
            "background_text": background_text,
            "cover_letter_text": cover_letter_text,
        },
        "job": {
            "title": body.title,
            "company": body.company,
            "description": description,
            "source_url": job_url,
        },
    }

    agent_key = os.getenv("AGENT_API_KEY")
    if not agent_key:
        raise HTTPException(status_code=503, detail="Agent service is not configured")
    headers = {"Authorization": f"Bearer {agent_key}"}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{AGENT_URL}/resume-generations", json=payload, headers=headers)
            if not response.is_success:
                detail = response.json().get("detail", "Agent service failed")
                raise HTTPException(status_code=502, detail=detail)
            result = response.json()
            document_response = await client.get(f"{AGENT_URL}{result['docx_url']}", headers=headers)
            document_response.raise_for_status()
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=503, detail=f"Agent service is not running at {AGENT_URL}") from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Agent service timed out") from exc
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Agent service failed") from exc

    if len(document_response.content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=502, detail="Generated document is too large")
    generation_id = str(uuid4())
    filename = f"{generation_id}.docx"
    (GENERATED_DIR / filename).write_bytes(document_response.content)
    session.add(ResumeGeneration(id=generation_id, user_id=user.id, filename=filename))
    session.commit()

    result["id"] = generation_id
    result["docx_url"] = f"/resume-generations/{generation_id}/resume.docx"
    return result


@app.get("/resume-generations/{generation_id}/resume.docx")
def download_generated_resume(
    generation_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    generation = session.scalar(
        select(ResumeGeneration).where(
            ResumeGeneration.id == generation_id,
            ResumeGeneration.user_id == user.id,
        )
    )
    if not generation:
        raise HTTPException(status_code=404, detail="Generated resume not found")
    return FileResponse(
        GENERATED_DIR / generation.filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="tailored-resume.docx",
    )


@app.post("/jobs/scrape", status_code=201)
def scrape_indeed_jobs(
    body: ScrapeRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    try:
        jobs = scrape_jobs(
            site_name=["indeed"],  # Indeed only
            search_term=body.search_term,
            location=body.location,
            results_wanted=body.results_wanted,
            country_indeed=body.country_indeed,
            hours_old=body.hours_old,
            verbose=0,
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Indeed is temporarily unavailable or blocked this request.",
        )

    # Pandas produces JSON-safe nulls and ISO-formatted dates.
    results = json.loads(jobs.to_json(orient="records", date_format="iso"))

    scrape_id = str(uuid4())
    filename = f"{scrape_id}.json"
    (OUTPUT_DIR / filename).write_text(
        json.dumps(results, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    session.add(JobScrape(
        id=scrape_id,
        user_id=user.id,
        filename=filename,
    ))
    session.commit()

    return {
        "scrape_id": scrape_id,
        "count": len(results),
        "download_url": f"/jobs/scrapes/{scrape_id}",
    }


@app.get("/jobs/scrapes/{scrape_id}")
def download_scrape(
    scrape_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    scrape = session.scalar(
        select(JobScrape).where(
            JobScrape.id == scrape_id,
            JobScrape.user_id == user.id,
        )
    )
    if not scrape:
        raise HTTPException(status_code=404, detail="Scrape result not found")

    return FileResponse(
        OUTPUT_DIR / scrape.filename,
        media_type="application/json",
        filename=scrape.filename,
    )