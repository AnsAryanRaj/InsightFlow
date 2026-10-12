"""Adaption integration: Adaption is the enrichment engine for unique reviews.

How it fits the workflow:
1. Upload every unique review (one row per text, not 7,000 repeats) as an Adaption dataset.
2. Run `adapt` with the review as the prompt column and the category as context.
   The `blueprint` brand control turns each generated completion into a structured
   analysis of that review (sentiment, topic, severity, summary, action).
   The `deduplication` recipe removes near-duplicate phrasings, and the safety
   categories flag abusive or hateful feedback.
3. Read Adaption's quality evaluation (grade and score before and after) for the
   Import health screen.
4. Download the adapted dataset, parse each completion and store it as the
   analysis for that review (engine = "adaption"). Rules fill any gaps.

Results are cached in data/adaption_results.json, so the app and the demo keep
working when the API is slow, out of credits, or no key is set.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import tempfile
import threading
import time
from datetime import datetime

from sqlalchemy import func, select

from . import config
from .analysis import analyze_rules, normalize, text_hash
from .db import Analysis, Feedback, SessionLocal, utcnow
from .taxonomy import ALL_TOPICS

log = logging.getLogger(__name__)

TOPIC_IDS = ", ".join(t.id for t in ALL_TOPICS.values())

BLUEPRINT = f"""You are a customer-insight analyst for an e-commerce marketplace.
The prompt is one customer review. The context gives the category it was filed under.
Reply with ONLY one JSON object and no other text, in this exact shape:
{{"sentiment": "positive|mixed|negative", "topic": "<topic id>", "severity": <0-5>,
  "summary": "<at most 10 words>", "action": "<one concrete step the business should take>"}}
Rules: "mixed" means a complaint the business partly fixed. Severity is 0 for praise and
5 when the customer lost money or was defrauded. Choose topic from: {TOPIC_IDS}."""

_lock = threading.Lock()


def configured() -> bool:
    return bool(config.ADAPTION_API_KEY)


def read_state() -> dict:
    if config.ADAPTION_STATE_FILE.exists():
        try:
            return json.loads(config.ADAPTION_STATE_FILE.read_text())
        except json.JSONDecodeError:
            pass
    return {"status": "idle"}


def _write_state(**kw) -> dict:
    state = {**read_state(), **kw, "updated_at": utcnow().isoformat()}
    config.ADAPTION_STATE_FILE.write_text(json.dumps(state, indent=2, default=str))
    return state


def cached_results() -> dict:
    if config.ADAPTION_RESULTS_FILE.exists():
        try:
            return json.loads(config.ADAPTION_RESULTS_FILE.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def active_adaption_count() -> int:
    try:
        with SessionLocal() as db:
            return db.scalar(select(func.count(Analysis.text_hash)).where(Analysis.engine == "adaption")) or 0
    except Exception:
        return 0


def status() -> dict:
    cache = cached_results()
    state = read_state()
    is_running = state.get("status") == "running" or _lock.locked()
    results = cache.get("results", [])
    enriched_count = len([r for r in results if r.get("engine") == "adaption"])
    fallback_count = len([r for r in results if r.get("engine") != "adaption"])
    db_applied = active_adaption_count()

    return {
        "configured": configured(),
        "is_active": is_running,
        "state": state,
        "cached": {
            "available": bool(results),
            "dataset_id": cache.get("dataset_id"),
            "created_at": cache.get("created_at"),
            "applied_at": cache.get("applied_at") or state.get("finished_at"),
            "enriched": enriched_count,
            "fallback_count": fallback_count,
            "db_applied": db_applied,
            "evaluation": cache.get("evaluation"),
            "estimate": cache.get("estimate"),
        },
        "blueprint": BLUEPRINT,
        "mode": "adaption" if db_applied > 0 else ("ready" if configured() else "local"),
    }


def _parse_completion(text: str) -> dict | None:
    if not text:
        return None
    raw = text.strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    if obj.get("sentiment") not in ("positive", "mixed", "negative"):
        return None
    return obj


def _pick_col(cols: list[str], *names: str) -> str | None:
    lower = {c.lower(): c for c in cols}
    for n in names:
        if n in lower:
            return lower[n]
    return None


def _merge(review: str, completion: dict | None, safety: str | None) -> dict:
    base = analyze_rules(review)
    flags = []
    if safety and safety.strip() not in ("", "[]", "None", "null", "nan"):
        flags = [safety.strip()[:200]]
    if not completion:
        return {**base, "safety_flags": flags}
    topic = completion.get("topic") if completion.get("topic") in ALL_TOPICS else base["topic"]
    sentiment = completion["sentiment"]
    try:
        severity = max(0, min(5, int(completion.get("severity", base["severity"]))))
    except (TypeError, ValueError):
        severity = base["severity"]
    return {
        **base,
        "topic": topic,
        "sentiment": sentiment,
        "severity": 0 if sentiment == "positive" else severity,
        "recovered": sentiment == "mixed",
        "summary": str(completion.get("summary") or base["summary"])[:160],
        "action": str(completion.get("action") or "")[:240],
        "engine": "adaption",
        "safety_flags": flags,
    }


def run_pipeline(max_rows: int | None = None, estimate_only: bool = False) -> dict:
    """Runs the full Adaption flow. Blocking; call from a thread or the CLI script."""
    if not configured():
        raise RuntimeError("Set ADAPTION_API_KEY to run the Adaption pipeline.")
    if not _lock.acquire(blocking=False):
        raise RuntimeError("An Adaption run is already in progress.")
    try:
        from adaption import Adaption

        client = Adaption(api_key=config.ADAPTION_API_KEY)
        _write_state(status="running", step="Collecting unique reviews", started_at=utcnow().isoformat(),
                     error=None)

        with SessionLocal() as db:
            rows = db.execute(
                select(Analysis.text, Feedback.category).join(Feedback, Feedback.text_hash == Analysis.text_hash)
            ).all()
        if not rows:
            raise RuntimeError("Import feedback first, then run Adaption.")
        cat_of: dict[str, str] = {}
        for text, cat in rows:
            cat_of.setdefault(text, cat)
        texts = list(cat_of)[: max_rows or None]

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["review", "category"])
        for t in texts:
            w.writerow([t, cat_of[t]])
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as fh:
            fh.write(buf.getvalue())
            path = fh.name

        _write_state(step=f"Uploading {len(texts)} unique reviews")
        up = client.datasets.upload_file(path, name=f"insightflow-feedback-{int(time.time())}")
        dataset_id = up.dataset_id
        _write_state(dataset_id=dataset_id, step="Waiting for the upload to be processed")

        for _ in range(90):
            st = client.datasets.get_status(dataset_id)
            if st.status in ("awaiting_input", "succeeded"):
                break
            if st.status == "failed":
                raise RuntimeError(f"Upload failed: {st.error_data.message if st.error_data else 'unknown'}")
            time.sleep(2)

        adapt_kwargs = dict(
            column_mapping={"prompt": "review", "context": ["category"]},
            recipe_specification={"recipes": {"deduplication": True, "prompt_rephrase": False,
                                              "reasoning_traces": False}},
            brand_controls={"length": "concise", "blueprint": BLUEPRINT,
                            "safety_categories": ["harassment", "hate", "violence"]},
            training_type="instruction_dataset",
        )
        est = client.datasets.adapt(dataset_id, estimate=True, **adapt_kwargs)
        estimate = {"credits": est.estimated_credits_consumed, "minutes": est.estimated_minutes}
        _write_state(estimate=estimate, step="Cost estimate ready")
        if estimate_only:
            _write_state(status="idle", step="Estimate only")
            return {"dataset_id": dataset_id, "estimate": estimate}

        _write_state(step="Adapting: Adaption is analyzing each review")
        client.datasets.adapt(dataset_id, job_specification={"idempotency_key": f"insightflow-{dataset_id}"},
                              **adapt_kwargs)
        final = client.datasets.wait_for_completion(dataset_id, timeout=3600)
        if final.status != "succeeded":
            msg = final.error_data.message if final.error_data else "unknown error"
            raise RuntimeError(f"Adaption run failed: {msg}")

        _write_state(step="Reading the quality evaluation")
        evaluation = None
        try:
            ev = client.datasets.wait_for_evaluation(dataset_id, timeout=600)
            if ev.quality:
                evaluation = {"status": ev.status, **ev.quality.model_dump()}
            else:
                evaluation = {"status": ev.status}
        except Exception as exc:  # evaluation is a bonus, never block the run on it
            evaluation = {"status": "unavailable", "detail": str(exc)[:200]}

        _write_state(step="Downloading the adapted dataset")
        content = client.datasets.download(dataset_id, file_format="csv").read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))
        cols = reader.fieldnames or []
        prompt_col = _pick_col(cols, "prompt", "review", "instruction", "input")
        completion_col = _pick_col(cols, "completion", "response", "output", "enhanced_completion")
        safety_col = _pick_col(cols, "prompt_safety_issues")

        results, parsed = [], 0
        seen = set()
        for row in reader:
            review = normalize(row.get(prompt_col or "", ""))
            if not review:
                continue
            completion = _parse_completion(row.get(completion_col or "", ""))
            parsed += bool(completion)
            merged = _merge(review, completion, row.get(safety_col) if safety_col else None)
            h = text_hash(review)
            seen.add(h)
            results.append({"text_hash": h, "text": review, **merged})

        now_iso = utcnow().isoformat()
        payload = {
            "dataset_id": dataset_id,
            "created_at": now_iso,
            "applied_at": now_iso,
            "evaluation": evaluation,
            "estimate": estimate,
            "rows_sent": len(texts),
            "rows_returned": len(results),
            "rows_removed_as_near_duplicates": max(0, len(texts) - len(seen)),
            "completions_parsed": parsed,
            "columns": cols,
            "results": results,
        }
        config.ADAPTION_RESULTS_FILE.write_text(json.dumps(payload, indent=2))
        applied = apply_cached_results()
        _write_state(status="succeeded", step="Done", finished_at=utcnow().isoformat(),
                     evaluation=evaluation, enriched=applied)
        return payload
    except Exception as exc:
        log.exception("Adaption pipeline failed")
        _write_state(status="failed", step="Failed", error=str(exc)[:500])
        raise
    finally:
        _lock.release()


def apply_cached_results() -> int:
    """Writes cached Adaption analyses into the analysis table. Returns how many were applied."""
    cache = cached_results()
    results = [r for r in cache.get("results", []) if r.get("engine") == "adaption"]
    if not results:
        return 0
    applied = 0
    with SessionLocal() as db:
        for r in results:
            a = db.get(Analysis, r["text_hash"])
            if not a:
                continue
            a.sentiment, a.score, a.topic = r["sentiment"], float(r["score"]), r["topic"]
            a.severity, a.recovered = int(r["severity"]), bool(r.get("recovered"))
            a.summary, a.engine, a.safety_flags = r.get("summary", ""), "adaption", r.get("safety_flags", [])
            applied += 1
        db.commit()
    if applied > 0 and config.ADAPTION_RESULTS_FILE.exists():
        try:
            cache["applied_at"] = utcnow().isoformat()
            config.ADAPTION_RESULTS_FILE.write_text(json.dumps(cache, indent=2))
        except Exception:
            pass
    return applied


def start_background(max_rows: int | None = None, estimate_only: bool = False) -> None:
    def _run():
        try:
            run_pipeline(max_rows=max_rows, estimate_only=estimate_only)
        except Exception:
            pass
        finally:
            from .insights import bump

            bump()

    threading.Thread(target=_run, daemon=True).start()
