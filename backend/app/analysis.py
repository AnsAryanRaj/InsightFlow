"""Turns a feedback text into sentiment, topic and severity.

Three engines, in order of preference for each unique text:
1. adaption  - results from the Adaption pipeline (see adaption_pipeline.py)
2. llm       - Claude, when ANTHROPIC_API_KEY is set (used for new, free-form feedback)
3. rules     - the taxonomy rules plus VADER sentiment. Always available, no network.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from . import config
from .taxonomy import ALL_TOPICS, COMPLAINTS, EARLY_PRAISE, OTHER, PRAISE, RECOVERY_CUES

log = logging.getLogger(__name__)
_vader = SentimentIntensityAnalyzer()
_compiled = {t.id: [re.compile(p, re.I) for p in t.patterns] for t in ALL_TOPICS.values()}
_recovery = re.compile(RECOVERY_CUES, re.I)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def text_hash(text: str) -> str:
    return hashlib.sha256(normalize(text).lower().encode("utf-8")).hexdigest()


def _match(topic_id: str, text: str) -> bool:
    return any(p.search(text) for p in _compiled[topic_id])


def classify_topic(text: str) -> str:
    for group in (EARLY_PRAISE, COMPLAINTS, PRAISE):
        for topic in group:
            if _match(topic.id, text):
                return topic.id
    return OTHER.id


def analyze_rules(text: str) -> dict:
    text = normalize(text)
    compound = _vader.polarity_scores(text)["compound"]
    topic = ALL_TOPICS[classify_topic(text)]
    recovered = False

    if topic.polarity == "praise":
        sentiment, severity = "positive", 0
        score = max(compound, 0.3)
    elif topic.polarity == "complaint":
        recovered = bool(_recovery.search(text))
        sentiment = "mixed" if recovered else "negative"
        severity = max(1, topic.severity - (1 if recovered else 0))
        score = min(compound, -0.3) if not recovered else max(min(compound, 0.2), -0.2)
    else:
        if compound >= 0.25:
            sentiment, severity = "positive", 0
        elif compound <= -0.25:
            sentiment, severity = "negative", 2
        else:
            sentiment, severity = "mixed", 1
        score = compound

    summary = topic.label if topic.id != "other" else (text[:80] + ("..." if len(text) > 80 else ""))
    return {
        "sentiment": sentiment,
        "score": round(float(score), 3),
        "topic": topic.id,
        "severity": int(severity),
        "recovered": recovered,
        "summary": summary,
        "engine": "rules",
        "safety_flags": [],
    }


# ---------------------------------------------------------------- LLM engine

def llm_available() -> bool:
    return bool(config.ANTHROPIC_API_KEY)


_TOPIC_GUIDE = "\n".join(f"- {t.id}: {t.label} ({t.polarity})" for t in ALL_TOPICS.values())

_LLM_PROMPT = """You label customer feedback for an e-commerce marketplace.
For each numbered review return one JSON object with:
  "i": the review number,
  "sentiment": "positive" | "mixed" | "negative"  (mixed = a complaint the business partly fixed),
  "topic": one id from the list below,
  "severity": 0 to 5 (0 for praise, 5 = the customer lost money or was defrauded),
  "summary": at most 10 words in plain English.
Topics:
{topics}
Return only a JSON array, nothing else.

Reviews:
{reviews}"""


def analyze_llm(texts: list[str]) -> list[dict | None]:
    """Labels texts with Claude. Returns None for any text it could not label."""
    if not llm_available() or not texts:
        return [None] * len(texts)
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        out: list[dict | None] = [None] * len(texts)
        for start in range(0, len(texts), 40):
            chunk = texts[start : start + 40]
            numbered = "\n".join(f"{i + 1}. {normalize(t)}" for i, t in enumerate(chunk))
            msg = client.messages.create(
                model=config.ANTHROPIC_MODEL,
                max_tokens=4000,
                messages=[{"role": "user", "content": _LLM_PROMPT.format(topics=_TOPIC_GUIDE, reviews=numbered)}],
            )
            raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
            raw = raw[raw.find("[") : raw.rfind("]") + 1]
            for item in json.loads(raw):
                idx = int(item.get("i", 0)) - 1
                if 0 <= idx < len(chunk):
                    out[start + idx] = _clean_llm(chunk[idx], item)
        return out
    except Exception as exc:  # network, quota, bad JSON: fall back to rules
        log.warning("LLM analysis failed, using rules: %s", exc)
        return [None] * len(texts)


def _clean_llm(text: str, item: dict) -> dict:
    base = analyze_rules(text)
    topic = item.get("topic") if item.get("topic") in ALL_TOPICS else base["topic"]
    sentiment = item.get("sentiment") if item.get("sentiment") in ("positive", "mixed", "negative") else base["sentiment"]
    try:
        severity = max(0, min(5, int(item.get("severity", base["severity"]))))
    except (TypeError, ValueError):
        severity = base["severity"]
    return {
        **base,
        "topic": topic,
        "sentiment": sentiment,
        "severity": 0 if sentiment == "positive" else severity,
        "recovered": sentiment == "mixed" and ALL_TOPICS[topic].polarity == "complaint",
        "summary": str(item.get("summary") or base["summary"])[:120],
        "engine": "llm",
    }


def analyze_many(texts: list[str], use_llm_for_unknown: bool = True) -> list[dict]:
    """Rules first. Texts the rules cannot place get a second pass with the LLM, if configured."""
    results = [analyze_rules(t) for t in texts]
    if use_llm_for_unknown and llm_available():
        unknown = [i for i, r in enumerate(results) if r["topic"] == "other"]
        if unknown:
            llm = analyze_llm([texts[i] for i in unknown])
            for i, r in zip(unknown, llm):
                if r:
                    results[i] = r
    return results
