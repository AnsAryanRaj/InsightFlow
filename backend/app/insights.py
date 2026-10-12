"""Aggregations behind the dashboard, insights, priorities and reports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import utcnow
from .taxonomy import ALL_TOPICS

_cache: dict = {"version": -1, "frame": None}
_version = {"n": 0}


def bump() -> None:
    """Call after any write so the next read rebuilds the frame."""
    _version["n"] += 1


def frame(db: Session) -> pd.DataFrame:
    if _cache["version"] == _version["n"] and _cache["frame"] is not None:
        return _cache["frame"]
    rows = db.execute(
        text(
            """SELECT f.id, f.text, f.text_hash, f.category, f.source, f.created_at, f.simulated_time,
                      a.sentiment, a.score, a.topic, a.severity, a.recovered, a.engine, a.summary
               FROM feedback f JOIN analysis a ON a.text_hash = f.text_hash"""
        )
    ).mappings().all()
    df = pd.DataFrame(rows)
    if not df.empty:
        df["created_at"] = pd.to_datetime(df["created_at"])
        df["topic_label"] = df["topic"].map(lambda t: ALL_TOPICS[t].label)
        df["polarity"] = df["topic"].map(lambda t: ALL_TOPICS[t].polarity)
    _cache.update(version=_version["n"], frame=df)
    return df


@dataclass
class Filters:
    category: str | None = None
    sentiment: str | None = None
    topic: str | None = None
    source: str | None = None
    q: str | None = None
    date_from: str | None = None
    date_to: str | None = None

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        m = pd.Series(True, index=df.index)
        if self.category:
            m &= df["category"].isin(self.category.split(","))
        if self.sentiment:
            m &= df["sentiment"].isin(self.sentiment.split(","))
        if self.topic:
            m &= df["topic"].isin(self.topic.split(","))
        if self.source:
            m &= df["source"].isin(self.source.split(","))
        if self.q:
            m &= df["text"].str.contains(self.q, case=False, regex=False)
        if self.date_from:
            m &= df["created_at"] >= pd.Timestamp(self.date_from)
        if self.date_to:
            m &= df["created_at"] < pd.Timestamp(self.date_to) + pd.Timedelta(days=1)
        return df[m]


def _share(n: float, d: float) -> float:
    return round(n / d, 4) if d else 0.0


def overview(db: Session, f: Filters) -> dict:
    all_df = frame(db)
    df = f.apply(all_df)
    if df.empty:
        return {"total": 0, "empty": all_df.empty}

    total = len(df)
    sent = df["sentiment"].value_counts()
    complaints = df[df["polarity"] == "complaint"]

    # Period change: negative share in the last 30 days vs the 30 days before
    end = df["created_at"].max()
    last = df[df["created_at"] > end - timedelta(days=30)]
    prev = df[(df["created_at"] <= end - timedelta(days=30)) & (df["created_at"] > end - timedelta(days=60))]
    neg_last = _share((last["sentiment"] == "negative").sum(), len(last))
    neg_prev = _share((prev["sentiment"] == "negative").sum(), len(prev))

    cats = []
    for cat, g in df.groupby("category"):
        vc = g["sentiment"].value_counts()
        cats.append({
            "category": cat,
            "total": int(len(g)),
            "positive": int(vc.get("positive", 0)),
            "mixed": int(vc.get("mixed", 0)),
            "negative": int(vc.get("negative", 0)),
        })
    cats.sort(key=lambda c: -c["total"])

    top = (
        complaints.groupby(["topic", "topic_label", "category"]).size().reset_index(name="count")
        .sort_values("count", ascending=False).head(8)
    )
    top_issues = [
        {"topic": r.topic, "label": r.topic_label, "category": r.category, "count": int(r.count),
         "share_of_complaints": _share(r.count, len(complaints))}
        for r in top.itertuples()
    ]

    weekly = (
        df.set_index("created_at")
        .groupby([pd.Grouper(freq="W-MON", label="left", closed="left"), "sentiment"]).size()
        .unstack(fill_value=0)
    )
    trend = [
        {
            "week": idx.strftime("%Y-%m-%d"),
            "positive": int(row.get("positive", 0)),
            "mixed": int(row.get("mixed", 0)),
            "negative": int(row.get("negative", 0)),
        }
        for idx, row in weekly.iterrows()
    ]
    first, last = df["created_at"].min(), end
    for t in trend:
        wk = pd.Timestamp(t["week"])
        t["partial"] = bool(wk < first.normalize() or wk + pd.Timedelta(days=7) > last)
        t["total"] = t["positive"] + t["mixed"] + t["negative"]
        t["negative_share"] = _share(t["negative"], t["total"])

    return {
        "total": total,
        "unique_texts": int(df["text_hash"].nunique()),
        "duplicate_share": round(1 - df["text_hash"].nunique() / total, 4),
        "sentiment": {k: int(sent.get(k, 0)) for k in ("positive", "mixed", "negative")},
        "negative_share": _share(sent.get("negative", 0), total),
        "positive_share": _share(sent.get("positive", 0), total),
        "complaints": int(len(complaints)),
        "avg_complaint_severity": round(float(complaints["severity"].mean()), 2) if len(complaints) else 0,
        "negative_share_last_30d": neg_last,
        "negative_share_prev_30d": neg_prev,
        "categories": cats,
        "top_issues": top_issues,
        "trend": trend,
        "date_range": [df["created_at"].min().isoformat(), end.isoformat()],
        "simulated_time": bool(df["simulated_time"].any()),
        "engines": {k: int(v) for k, v in df.drop_duplicates("text_hash")["engine"].value_counts().items()},
    }


def topics(db: Session, f: Filters) -> list[dict]:
    df = f.apply(frame(db))
    if df.empty:
        return []
    end = df["created_at"].max()
    start = end - timedelta(days=84)
    out = []
    for topic_id, g in df.groupby("topic"):
        t = ALL_TOPICS[topic_id]
        vc = g["sentiment"].value_counts()
        phrasings = g.groupby("text").size().sort_values(ascending=False)
        weekly = (
            g[g["created_at"] > start].set_index("created_at").resample("W-MON").size()
        )
        out.append({
            "topic": topic_id,
            "label": t.label,
            "category": t.category,
            "polarity": t.polarity,
            "count": int(len(g)),
            "share": _share(len(g), len(df)),
            "phrasings": int(len(phrasings)),
            "positive": int(vc.get("positive", 0)),
            "mixed": int(vc.get("mixed", 0)),
            "negative": int(vc.get("negative", 0)),
            "avg_severity": round(float(g["severity"].mean()), 2),
            "examples": [{"text": txt, "count": int(n)} for txt, n in phrasings.head(4).items()],
            "weekly": [int(v) for v in weekly.values][-12:],
        })
    out.sort(key=lambda r: (-r["count"]))
    return out


# ------------------------------------------------------------- priorities

WEIGHTS = {"volume": 0.35, "negativity": 0.25, "severity": 0.25, "growth": 0.15}
MIN_RELIABLE_COUNT = 30


def priorities(db: Session, f: Filters) -> list[dict]:
    df = f.apply(frame(db))
    complaints = df[df["polarity"] == "complaint"] if not df.empty else df
    if complaints.empty:
        return []
    end = df["created_at"].max()
    recent_cut, prev_cut = end - timedelta(days=14), end - timedelta(days=28)
    groups = list(complaints.groupby("topic"))
    max_count = max(len(g) for _, g in groups)
    total_complaints = len(complaints)
    ranked_by_volume = sorted((len(g), t) for t, g in groups)[::-1]
    rank_of = {t: i + 1 for i, (_, t) in enumerate(ranked_by_volume)}

    out = []
    for topic_id, g in groups:
        t = ALL_TOPICS[topic_id]
        count = len(g)
        neg = int((g["sentiment"] == "negative").sum())
        mixed = int((g["sentiment"] == "mixed").sum())
        negativity = (neg + 0.5 * mixed) / count
        sev = float(g["severity"].mean())
        recent = int((g["created_at"] > recent_cut).sum())
        previous = int(((g["created_at"] <= recent_cut) & (g["created_at"] > prev_cut)).sum())
        growth = (recent - previous) / previous if previous else (1.0 if recent else 0.0)

        comp = {
            "volume": count / max_count,
            "negativity": negativity,
            "severity": sev / 5,
            # Growth only counts once there is enough history to compare; otherwise neutral
            "growth": min(max((growth + 0.5) / 1.0, 0.0), 1.0) if previous >= 5 else 0.5,
        }
        # Small samples get damped so one loud review cannot outrank a real pattern
        confidence = min(1.0, count / MIN_RELIABLE_COUNT) ** 0.5
        score = round(100 * confidence * sum(WEIGHTS[k] * v for k, v in comp.items()))
        tier = "Critical" if score >= 85 else "High" if score >= 72 else "Medium" if score >= 58 else "Low"

        reasons = [
            f"Mentioned in {count:,} reviews, {count / total_complaints:.0%} of all complaints"
            + (f" and the #{rank_of[topic_id]} complaint by volume." if rank_of[topic_id] <= 3 else "."),
            f"{neg / count:.0%} of mentions are fully negative"
            + (f"; {mixed:,} were partly fixed by the business." if mixed else "."),
            f"Severity {sev:.1f} out of 5. {t.why}",
        ]
        if previous:
            direction = "up" if growth > 0.05 else "down" if growth < -0.05 else "flat"
            reasons.append(
                f"{recent} reports in the last 14 days vs {previous} in the 14 before ({direction} {abs(growth):.0%})."
            )

        examples = g.groupby("text").size().sort_values(ascending=False).head(3)
        out.append({
            "topic": topic_id,
            "label": t.label,
            "category": t.category,
            "owner": t.owner,
            "score": int(score),
            "tier": tier,
            "count": count,
            "share_of_complaints": _share(count, total_complaints),
            "negative": neg,
            "mixed": mixed,
            "avg_severity": round(sev, 2),
            "recent_14d": recent,
            "previous_14d": previous,
            "growth": round(growth, 4),
            "components": {k: round(v, 4) for k, v in comp.items()},
            "confidence": round(confidence, 3),
            "weights": WEIGHTS,
            "reasons": reasons,
            "actions": list(t.actions),
            "examples": [{"text": txt, "count": int(n)} for txt, n in examples.items()],
        })
    out.sort(key=lambda r: -r["score"])
    for i, r in enumerate(out):
        r["rank"] = i + 1
    return out


def executive_summary(ov: dict, pr: list[dict]) -> list[str]:
    """Plain-English findings built only from computed numbers."""
    if not ov.get("total"):
        return []
    lines = [
        f"{ov['total']:,} pieces of feedback analyzed. {ov['negative_share']:.0%} are negative, "
        f"{ov['positive_share']:.0%} positive.",
        f"Only {ov['unique_texts']:,} are unique. {ov['duplicate_share']:.0%} are repeats of the same messages, "
        "so a small set of problems drives most of the volume.",
    ]
    critical = [p for p in pr if p["tier"] in ("Critical", "High")]
    if pr:
        top = pr[0]
        lines.append(
            f"Top priority: {top['label'].lower()} ({top['count']:,} reports, severity {top['avg_severity']:.1f}/5). "
            f"Owner: {top['owner']}."
        )
    if len(critical) > 1:
        lines.append(f"{len(critical)} issues are rated critical or high and need an owner this week.")
    fraud = [c for c in ov["categories"] if c["category"] == "Fraud and Scam"]
    if fraud and fraud[0]["total"]:
        lines.append(
            f"Fraud and scam reports make up {fraud[0]['total'] / ov['total']:.0%} of all feedback, "
            f"and {fraud[0]['negative'] / fraud[0]['total']:.0%} of them are negative."
        )
    return lines


def report_payload(db: Session, f: Filters, issues: list[dict]) -> dict:
    ov = overview(db, f)
    pr = priorities(db, f)
    tp = topics(db, f)
    return {
        "generated_at": utcnow().isoformat(),
        "filters": f.__dict__,
        "summary": executive_summary(ov, pr),
        "overview": ov,
        "priorities": pr[:6],
        "praise": [t for t in tp if t["polarity"] == "praise"][:5],
        "issues": issues,
    }
