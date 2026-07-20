from typing import Literal

from pydantic import BaseModel, Field


class CandidateProfile(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(default="", max_length=50)
    location: str = Field(default="", max_length=120)
    github_repo: str = Field(default="", max_length=500)
    github_evidence: str = Field(default="", max_length=100_000)
    portfolio: str = Field(default="", max_length=500)
    linkedin: str = Field(default="", max_length=500)
    resume_text: str = Field(default="", max_length=100_000)
    background_text: str = Field(default="", max_length=100_000)
    cover_letter_text: str = Field(default="", max_length=100_000)
    portfolio_text: str = Field(default="", max_length=100_000)


class JobDetails(BaseModel):
    description: str = Field(min_length=50, max_length=100_000)
    title: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    source_url: str = Field(default="", max_length=1000)


class GenerationRequest(BaseModel):
    profile: CandidateProfile
    job: JobDetails
    openai_api_key: str = Field(default="", max_length=500)


class RequirementMatch(BaseModel):
    requirement: str
    status: Literal["matched", "partial", "not_found"]
    evidence: str
    source: str


class ExperienceEntry(BaseModel):
    title: str
    organization: str
    location: str
    start_date: str
    end_date: str
    bullets: list[str]


class ProjectEntry(BaseModel):
    name: str
    link: str
    technologies: list[str]
    bullets: list[str]


class EducationEntry(BaseModel):
    institution: str
    credential: str
    location: str
    graduation_date: str
    details: list[str]


class ResumeDraft(BaseModel):
    professional_summary: str
    skills: list[str]
    experience: list[ExperienceEntry]
    projects: list[ProjectEntry]
    education: list[EducationEntry]
    certifications: list[str]
    requirement_matches: list[RequirementMatch]
