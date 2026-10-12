"""CSV import: clean, dedupe, analyze each unique text once, assign timestamps."""

from __future__ import annotations

import hashlib
import io
import json
import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .analysis import analyze_many, normalize, text_hash
from .db import Analysis, Feedback, ImportRun, utcnow
from .taxonomy import ALL_TOPICS, CATEGORIES

TEXT_COLUMNS = ("review", "feedback", "text", "comment", "message", "content", "body")
CATEGORY_COLUMNS = ("category", "type", "label", "topic", "department")
DATE_COLUMNS = ("date", "created_at", "timestamp", "submitted_at", "time")


class ImportError_(ValueError):
    pass


def _pick(columns: list[str], options: tuple[str, ...]) -> str | None:
    lower = {c.lower().strip(): c for c in columns}
    for o in options:
        if o in lower:
            return lower[o]
    return None


def load_adaption_cache() -> dict[str, dict]:
    """Analyses produced by an earlier Adaption run, keyed by text hash."""
    if config.ADAPTION_RESULTS_FILE.exists():
        try:
            data = json.loads(config.ADAPTION_RESULTS_FILE.read_text())
            return {r["text_hash"]: r for r in data.get("results", [])}
        except (json.JSONDecodeError, KeyError):
            return {}
    return {}


def ensure_analyses(db: Session, texts: list[str]) -> dict[str, Analysis]:
    """Returns an Analysis per unique text, creating only the ones not seen before."""
    by_hash: dict[str, str] = {}
    for t in texts:
        by_hash.setdefault(text_hash(t), normalize(t))
    existing = {
        a.text_hash: a
        for a in db.scalars(select(Analysis).where(Analysis.text_hash.in_(list(by_hash))))
    }
    missing = [h for h in by_hash if h not in existing]
    if missing:
        cache = load_adaption_cache()
        fresh_hashes = [h for h in missing if h not in cache]
        fresh = analyze_many([by_hash[h] for h in fresh_hashes])
        results = {h: r for h, r in zip(fresh_hashes, fresh)}
        for h in missing:
            r = results.get(h) or cache[h]
            a = Analysis(
                text_hash=h,
                text=by_hash[h],
                sentiment=r["sentiment"],
                score=float(r["score"]),
                topic=r["topic"] if r["topic"] in ALL_TOPICS else "other",
                severity=int(r["severity"]),
                recovered=bool(r.get("recovered", False)),
                summary=r.get("summary", ""),
                engine=r.get("engine", "rules"),
                safety_flags=r.get("safety_flags", []),
            )
            db.add(a)
            existing[h] = a
        db.flush()
    return existing


def _drift(topic: str) -> float:
    """A fixed, seeded trend direction per topic, between -0.6 and 0.6."""
    digest = hashlib.md5(f"{config.SIMULATION_SEED}:{topic}".encode()).hexdigest()
    return (int(digest[:8], 16) / 0xFFFFFFFF) * 1.2 - 0.6


def simulate_timestamps(topics: list[str], end: datetime, seed: int) -> list[datetime]:
    """The dataset has no dates. Spread rows over the window so trends can be shown.

    Each topic gets a gentle seeded drift (rising or falling over the window).
    The UI labels these timestamps as simulated.
    """
    rng = np.random.default_rng(seed)
    days = config.SIMULATED_WINDOW_DAYS
    start = end - timedelta(days=days)
    out = []
    for topic in topics:
        d = _drift(topic)
        u = rng.random()
        if abs(d) < 1e-6:
            t = u
        else:  # inverse CDF of density 1 + d(2t - 1) on [0, 1]
            t = (-(1 - d) + math.sqrt((1 - d) ** 2 + 4 * d * u)) / (2 * d)
        out.append(start + timedelta(days=float(t) * days))
    return out


def import_frame(db: Session, df: pd.DataFrame, filename: str, source: str = "csv") -> dict:
    if df.empty:
        raise ImportError_("The file has no rows.")
    text_col = _pick(list(df.columns), TEXT_COLUMNS) or (df.columns[0] if len(df.columns) == 1 else None)
    if not text_col:
        raise ImportError_(
            "Could not find a feedback column. Name it one of: " + ", ".join(TEXT_COLUMNS) + "."
        )
    cat_col = _pick(list(df.columns), CATEGORY_COLUMNS)
    date_col = _pick(list(df.columns), DATE_COLUMNS)

    total_rows = int(len(df))
    df = df.copy()
    df["_text"] = df[text_col].fillna("").astype(str).map(normalize)
    empty = int((df["_text"].str.len() == 0).sum())
    too_short = int(((df["_text"].str.len() > 0) & (df["_text"].str.len() < 8)).sum())
    df = df[df["_text"].str.len() >= 8]
    if df.empty:
        raise ImportError_("Every row was empty or too short to analyze.")
    non_english = int(df["_text"].map(lambda s: sum(ord(c) > 127 for c in s) / max(len(s), 1) > 0.3).sum())

    df["_hash"] = df["_text"].map(text_hash)
    unique = int(df["_hash"].nunique())

    run = ImportRun(filename=filename)
    db.add(run)
    db.flush()

    analyses = ensure_analyses(db, df["_text"].tolist())

    # Category: use the file's own label when it has one, otherwise the topic's category
    def category_for(row) -> str:
        if cat_col and isinstance(row.get(cat_col), str) and row[cat_col].strip():
            return row[cat_col].strip()
        return ALL_TOPICS[analyses[row["_hash"]].topic].category

    df["_category"] = df.apply(category_for, axis=1)
    missing_category = int(len(df)) - int(df[cat_col].notna().sum()) if cat_col else int(len(df))

    simulated = True
    if date_col:
        parsed = pd.to_datetime(df[date_col], errors="coerce", utc=True).dt.tz_convert(None)
        if parsed.notna().mean() > 0.8:
            simulated = False
            df["_created"] = parsed.fillna(pd.Timestamp(utcnow()))
    if simulated:
        end = utcnow()
        topics = [analyses[h].topic for h in df["_hash"]]
        df["_created"] = simulate_timestamps(topics, end, config.SIMULATION_SEED + run.id)

    db.bulk_save_objects(
        [
            Feedback(
                text=row["_text"],
                text_hash=row["_hash"],
                category=row["_category"],
                source=source,
                created_at=pd.Timestamp(row["_created"]).to_pydatetime(),
                simulated_time=simulated,
                import_id=run.id,
            )
            for row in df.to_dict("records")
        ]
    )

    engines: dict[str, int] = {}
    for h in df["_hash"].unique():
        e = analyses[h].engine
        engines[e] = engines.get(e, 0) + 1

    health = {
        "filename": filename,
        "rows_in_file": total_rows,
        "rows_imported": int(len(df)),
        "unique_texts": unique,
        "duplicate_rows": int(len(df)) - unique,
        "duplicate_share": round(1 - unique / len(df), 4),
        "empty_rows": empty,
        "too_short_rows": too_short,
        "non_english_rows": non_english,
        "text_column": text_col,
        "category_column": cat_col,
        "date_column": date_col if not simulated else None,
        "missing_category": missing_category,
        "categories_found": sorted(df["_category"].unique().tolist()),
        "unknown_categories": sorted(set(df["_category"].unique()) - set(CATEGORIES)),
        "simulated_timestamps": simulated,
        "analysis_engines": engines,
        "texts_analyzed_now": unique,
    }
    run.health = health
    db.commit()
    return {"import_id": run.id, **health}


def import_csv_bytes(db: Session, content: bytes, filename: str) -> dict:
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise ImportError_(f"Could not read the CSV: {exc}") from exc
    return import_frame(db, df, filename, source="csv")


def import_sample(db: Session) -> dict:
    df = pd.read_csv(config.SAMPLE_CSV)
    return import_frame(db, df, config.SAMPLE_CSV.name, source="dataset")


def add_single(db: Session, text: str, category: str | None) -> Feedback:
    text = normalize(text)
    if len(text) < 8:
        raise ImportError_("Feedback needs at least 8 characters.")
    analyses = ensure_analyses(db, [text])
    a = analyses[text_hash(text)]
    fb = Feedback(
        text=text,
        text_hash=a.text_hash,
        category=(category or "").strip() or ALL_TOPICS[a.topic].category,
        source="form",
        created_at=utcnow(),
        simulated_time=False,
    )
    db.add(fb)
    db.commit()
    return fb
