from __future__ import annotations

import csv
import io
import os
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import adaption_pipeline, config, insights
from .analysis import llm_available
from .db import Analysis, Feedback, ImportRun, Issue, Report, SessionLocal, init_db
from .ingest import ImportError_, add_single, import_csv_bytes, import_sample
from .insights import Filters
from .taxonomy import ALL_TOPICS, CATEGORIES


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        empty = db.scalar(select(func.count(Feedback.id))) == 0
        if empty and os.getenv("AUTOLOAD_SAMPLE", "1") == "1":
            import_sample(db)
    adaption_pipeline.apply_cached_results()
    insights.bump()
    yield


app = FastAPI(title="InsightFlow API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    with SessionLocal() as db:
        yield db


def filters(
    category: str | None = None,
    sentiment: str | None = None,
    topic: str | None = None,
    source: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> Filters:
    return Filters(category, sentiment, topic, source, q, date_from, date_to)


# ------------------------------------------------------------------ meta

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    return {
        "ok": True,
        "feedback": db.scalar(select(func.count(Feedback.id))),
        "llm": llm_available(),
        "adaption": adaption_pipeline.configured(),
    }


@app.get("/api/meta")
def meta():
    return {
        "categories": list(CATEGORIES),
        "topics": [
            {"id": t.id, "label": t.label, "category": t.category, "polarity": t.polarity}
            for t in ALL_TOPICS.values()
        ],
        "sentiments": ["positive", "mixed", "negative"],
    }


# -------------------------------------------------------------- feedback

class FeedbackIn(BaseModel):
    text: str = Field(min_length=8, max_length=2000)
    category: str | None = None


@app.post("/api/feedback")
def submit_feedback(body: FeedbackIn, db: Session = Depends(get_db)):
    try:
        fb = add_single(db, body.text, body.category)
    except ImportError_ as exc:
        raise HTTPException(400, str(exc))
    insights.bump()
    a = db.get(Analysis, fb.text_hash)
    return {"id": fb.id, "text": fb.text, "category": fb.category, "sentiment": a.sentiment,
            "topic": a.topic, "topic_label": ALL_TOPICS[a.topic].label, "severity": a.severity,
            "engine": a.engine}


@app.post("/api/feedback/import")
async def import_feedback(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Upload a .csv file.")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "The file is over 20 MB. Split it and import the parts.")
    try:
        result = import_csv_bytes(db, content, file.filename or "upload.csv")
    except ImportError_ as exc:
        raise HTTPException(400, str(exc))
    insights.bump()
    return result


@app.post("/api/feedback/sample")
def load_sample(replace: bool = True, db: Session = Depends(get_db)):
    if replace:
        db.execute(delete(Feedback))
        db.commit()
    result = import_sample(db)
    insights.bump()
    return result


@app.delete("/api/feedback")
def clear_feedback(db: Session = Depends(get_db)):
    db.execute(delete(Feedback))
    db.commit()
    insights.bump()
    return {"ok": True}


@app.get("/api/feedback")
def list_feedback(
    f: Filters = Depends(filters),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    group: bool = False,
    sort: str = "newest",
    db: Session = Depends(get_db),
):
    df = f.apply(insights.frame(db))
    if df.empty:
        return {"total": 0, "page": page, "page_size": page_size, "items": []}
    if group:
        g = (
            df.groupby(["text", "category", "sentiment", "topic", "topic_label", "severity", "engine"])
            .agg(count=("id", "size"), last_seen=("created_at", "max"))
            .reset_index()
        )
        g = g.sort_values("count" if sort == "repeats" else "last_seen", ascending=False)
        total = len(g)
        chunk = g.iloc[(page - 1) * page_size : page * page_size]
        items = [
            {**r, "last_seen": r["last_seen"].isoformat()} for r in chunk.to_dict("records")
        ]
    else:
        order = {"newest": ("created_at", False), "oldest": ("created_at", True),
                 "severity": ("severity", False)}.get(sort, ("created_at", False))
        d = df.sort_values(order[0], ascending=order[1])
        total = len(d)
        chunk = d.iloc[(page - 1) * page_size : page * page_size]
        items = [
            {
                "id": int(r["id"]), "text": r["text"], "category": r["category"], "source": r["source"],
                "created_at": r["created_at"].isoformat(), "simulated_time": bool(r["simulated_time"]),
                "sentiment": r["sentiment"], "topic": r["topic"], "topic_label": r["topic_label"],
                "severity": int(r["severity"]), "engine": r["engine"],
            }
            for r in chunk.to_dict("records")
        ]
    return {"total": int(total), "page": page, "page_size": page_size, "items": items}


@app.get("/api/imports")
def list_imports(db: Session = Depends(get_db)):
    runs = db.scalars(select(ImportRun).order_by(ImportRun.id.desc()).limit(10)).all()
    return [{"id": r.id, "created_at": r.created_at.isoformat(), **(r.health or {})} for r in runs]


# -------------------------------------------------------------- insights

@app.get("/api/overview")
def get_overview(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    return insights.overview(db, f)


@app.get("/api/topics")
def get_topics(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    return insights.topics(db, f)


@app.get("/api/priorities")
def get_priorities(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    pr = insights.priorities(db, f)
    tracked = {i.topic: i.id for i in db.scalars(select(Issue)).all()}
    for p in pr:
        p["tracked_issue_id"] = tracked.get(p["topic"])
    return pr


@app.get("/api/summary")
def get_summary(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    ov = insights.overview(db, f)
    return {"lines": insights.executive_summary(ov, insights.priorities(db, f))}


# ----------------------------------------------------------------- issues

class IssueIn(BaseModel):
    topic: str
    title: str | None = None
    owner: str | None = None
    notes: str | None = None


class IssuePatch(BaseModel):
    status: str | None = None
    owner: str | None = None
    notes: str | None = None
    title: str | None = None


def issue_dict(i: Issue) -> dict:
    return {
        "id": i.id, "topic": i.topic, "title": i.title, "status": i.status, "owner": i.owner,
        "notes": i.notes, "priority_score": i.priority_score, "evidence": i.evidence,
        "created_at": i.created_at.isoformat(), "updated_at": i.updated_at.isoformat(),
    }


@app.get("/api/issues")
def list_issues(db: Session = Depends(get_db)):
    return [issue_dict(i) for i in db.scalars(select(Issue).order_by(Issue.priority_score.desc())).all()]


@app.post("/api/issues")
def create_issue(body: IssueIn, db: Session = Depends(get_db)):
    if body.topic not in ALL_TOPICS:
        raise HTTPException(400, "Unknown topic.")
    existing = db.scalar(select(Issue).where(Issue.topic == body.topic))
    if existing:
        return issue_dict(existing)
    pr = {p["topic"]: p for p in insights.priorities(db, Filters())}
    p = pr.get(body.topic, {})
    issue = Issue(
        topic=body.topic,
        title=body.title or ALL_TOPICS[body.topic].label,
        owner=body.owner or ALL_TOPICS[body.topic].owner,
        notes=body.notes or "",
        priority_score=p.get("score", 0),
        evidence={k: p.get(k) for k in ("count", "avg_severity", "tier", "reasons", "actions", "growth")},
    )
    db.add(issue)
    db.commit()
    return issue_dict(issue)


@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: int, body: IssuePatch, db: Session = Depends(get_db)):
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found.")
    if body.status and body.status not in ("open", "in_progress", "resolved"):
        raise HTTPException(400, "Status must be open, in_progress or resolved.")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(issue, k, v)
    db.commit()
    return issue_dict(issue)


@app.delete("/api/issues/{issue_id}")
def delete_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = db.get(Issue, issue_id)
    if issue:
        db.delete(issue)
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- reports

class ReportIn(BaseModel):
    title: str | None = None
    category: str | None = None
    sentiment: str | None = None
    date_from: str | None = None
    date_to: str | None = None


@app.get("/api/report/preview")
def report_preview(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    issues = [issue_dict(i) for i in db.scalars(select(Issue)).all()]
    return insights.report_payload(db, f, issues)


@app.post("/api/reports")
def create_report(body: ReportIn, db: Session = Depends(get_db)):
    f = Filters(category=body.category, sentiment=body.sentiment, date_from=body.date_from, date_to=body.date_to)
    issues = [issue_dict(i) for i in db.scalars(select(Issue)).all()]
    payload = insights.report_payload(db, f, issues)
    slug = secrets.token_urlsafe(6)
    report = Report(slug=slug, title=body.title or "Customer feedback insight report", payload=payload)
    db.add(report)
    db.commit()
    return {"slug": slug, "title": report.title, "created_at": report.created_at.isoformat()}


@app.get("/api/reports/{slug}")
def get_report(slug: str, db: Session = Depends(get_db)):
    r = db.get(Report, slug)
    if not r:
        raise HTTPException(404, "This report link does not exist or was removed.")
    return {"slug": r.slug, "title": r.title, "created_at": r.created_at.isoformat(), "payload": r.payload}


@app.get("/api/reports")
def list_reports(db: Session = Depends(get_db)):
    rows = db.scalars(select(Report).order_by(Report.created_at.desc()).limit(20)).all()
    return [{"slug": r.slug, "title": r.title, "created_at": r.created_at.isoformat()} for r in rows]


# ----------------------------------------------------------------- export

def _csv_response(rows: list[dict], name: str) -> StreamingResponse:
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/export/priorities.csv")
def export_priorities(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    rows = [
        {"rank": p["rank"], "issue": p["label"], "category": p["category"], "owner": p["owner"],
         "priority_score": p["score"], "tier": p["tier"], "reports": p["count"],
         "share_of_complaints": p["share_of_complaints"], "avg_severity": p["avg_severity"],
         "growth_14d": p["growth"], "why": " ".join(p["reasons"]), "actions": " | ".join(p["actions"])}
        for p in insights.priorities(db, f)
    ]
    return _csv_response(rows, "insightflow_priorities.csv")


@app.get("/api/export/feedback.csv")
def export_feedback(f: Filters = Depends(filters), db: Session = Depends(get_db)):
    df = f.apply(insights.frame(db))
    cols = ["id", "created_at", "category", "text", "sentiment", "topic_label", "severity", "engine"]
    rows = df[cols].assign(created_at=df["created_at"].astype(str)).to_dict("records") if not df.empty else []
    return _csv_response(rows, "insightflow_feedback.csv")


# ---------------------------------------------------------------- adaption

class AdaptionRunIn(BaseModel):
    max_rows: int | None = None
    estimate_only: bool = False


@app.get("/api/adaption")
def adaption_status():
    return adaption_pipeline.status()


@app.post("/api/adaption/run")
def adaption_run(body: AdaptionRunIn):
    if not adaption_pipeline.configured():
        raise HTTPException(400, "Add ADAPTION_API_KEY to the backend environment, then try again.")
    if adaption_pipeline.read_state().get("status") == "running":
        raise HTTPException(409, "An Adaption run is already in progress.")
    adaption_pipeline.start_background(max_rows=body.max_rows, estimate_only=body.estimate_only)
    return {"started": True}


@app.post("/api/adaption/apply")
def adaption_apply():
    applied = adaption_pipeline.apply_cached_results()
    insights.bump()
    return {"applied": applied, "status": adaption_pipeline.status()}
