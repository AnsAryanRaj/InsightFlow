from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    """One analysis per unique text. Every duplicate row reuses it."""

    __tablename__ = "analysis"
    text_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    sentiment: Mapped[str] = mapped_column(String(16))  # positive | mixed | negative
    score: Mapped[float] = mapped_column(Float)  # -1..1
    topic: Mapped[str] = mapped_column(String(48), index=True)
    severity: Mapped[int] = mapped_column(Integer)  # 0..5, 0 for praise
    recovered: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    engine: Mapped[str] = mapped_column(String(16), default="rules")  # rules | adaption | llm
    safety_flags: Mapped[list] = mapped_column(JSON, default=list)


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    text: Mapped[str] = mapped_column(Text)
    text_hash: Mapped[str] = mapped_column(String(64), ForeignKey("analysis.text_hash"), index=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(32), default="dataset")  # dataset | form | csv
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    simulated_time: Mapped[bool] = mapped_column(Boolean, default=False)
    import_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ImportRun(Base):
    __tablename__ = "imports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    health: Mapped[dict] = mapped_column(JSON, default=dict)


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic: Mapped[str] = mapped_column(String(48))
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | in_progress | resolved
    owner: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    priority_score: Mapped[int] = mapped_column(Integer, default=0)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Report(Base):
    __tablename__ = "reports"
    slug: Mapped[str] = mapped_column(String(16), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    payload: Mapped[dict] = mapped_column(JSON)


def init_db() -> None:
    Base.metadata.create_all(engine)
