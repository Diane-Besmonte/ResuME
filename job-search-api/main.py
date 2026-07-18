import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import jwt
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jobspy import scrape_jobs
from jwt import InvalidTokenError
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy import ForeignKey, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_HOURS = 24

OUTPUT_DIR = Path("output")
UPLOAD_DIR = Path("uploads/resumes")

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
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


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
    return {
        "name": user.name,
        "email": user.email,
        "github_repo": user.github_repo,
        "portfolio": user.portfolio,
        "background": user.background,
        "cover_letter": user.cover_letter,
        "resume_download_url": (
            "/account/resume" if user.resume_filename else None
        ),
    }


app = FastAPI(title="ResuME Job Search API")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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


@app.post("/account/resume")
async def upload_resume(
    resume: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Resume must be a PDF")

    content = await resume.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume exceeds 5 MB")

    filename = f"{uuid4()}.pdf"
    (UPLOAD_DIR / filename).write_bytes(content)

    user.resume_filename = filename
    session.commit()

    return {"message": "Resume uploaded", "resume_download_url": "/account/resume"}


@app.get("/account/resume")
def download_resume(user: User = Depends(get_current_user)):
    if not user.resume_filename:
        raise HTTPException(status_code=404, detail="No resume uploaded")

    return FileResponse(
        UPLOAD_DIR / user.resume_filename,
        media_type="application/pdf",
        filename="resume.pdf",
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