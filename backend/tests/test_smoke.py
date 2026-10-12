import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["feedback"] == 7000
    assert "adaption" in data


def test_adaption_status_and_missing_key(monkeypatch):
    # 1. Status endpoint reports complete metadata
    res = client.get("/api/adaption")
    assert res.status_code == 200
    status = res.json()
    assert "configured" in status
    assert "mode" in status
    assert "is_active" in status
    assert "state" in status
    assert "cached" in status
    assert "blueprint" in status

    # 2. Starting run without key must return 400 with helpful error
    import app.config as app_config
    monkeypatch.setattr(app_config, "ADAPTION_API_KEY", "")
    run_res = client.post("/api/adaption/run", json={"estimate_only": True})
    assert run_res.status_code == 400
    assert "ADAPTION_API_KEY" in run_res.json()["detail"]

    # 3. Apply endpoint works safely
    apply_res = client.post("/api/adaption/apply")
    assert apply_res.status_code == 200
    assert "applied" in apply_res.json()


def test_feedback_modes_and_sorting():
    # 1. Ungrouped mode default
    res = client.get("/api/feedback?group=false&page=1&page_size=25&sort=newest")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 7000
    assert len(data["items"]) == 25
    first = data["items"][0]
    assert "id" in first
    assert "text" in first
    assert "sentiment" in first
    assert "severity" in first

    # 2. Grouped mode
    res_group = client.get("/api/feedback?group=true&page=1&page_size=25&sort=repeats")
    assert res_group.status_code == 200
    data_group = res_group.json()
    assert data_group["total"] == 320
    assert len(data_group["items"]) == 25
    grouped_first = data_group["items"][0]
    assert "count" in grouped_first
    assert grouped_first["count"] > 1
    assert "last_seen" in grouped_first

    # 3. Verify valid sort options
    for sort_key in ["newest", "oldest", "severity"]:
        r = client.get(f"/api/feedback?group=false&sort={sort_key}&page_size=5")
        assert r.status_code == 200


def test_overview_reconciliation():
    res = client.get("/api/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 7000
    assert data["unique_texts"] == 320
    assert data["sentiment"]["positive"] + data["sentiment"]["mixed"] + data["sentiment"]["negative"] == 7000
    assert sum(c["total"] for c in data["categories"]) == 7000
    assert len(data["top_issues"]) > 0


def test_priorities_scoring():
    res = client.get("/api/priorities")
    assert res.status_code == 200
    priorities = res.json()
    assert len(priorities) == 12
    for p in priorities:
        assert p["rank"] >= 1
        assert p["score"] >= 0 and p["score"] <= 100
        assert p["tier"] in ("Critical", "High", "Medium", "Low")
        assert len(p["actions"]) > 0
        assert len(p["reasons"]) >= 3
        # Verify score matches components
        comp = p["components"]
        w = p["weights"]
        conf = p["confidence"]
        expected = round(100 * conf * sum(w[k] * comp[k] for k in comp))
        assert p["score"] == expected


def test_report_preview_and_empty_filters():
    # 1. Normal preview
    res = client.get("/api/report/preview")
    assert res.status_code == 200
    payload = res.json()
    assert "overview" in payload
    assert "priorities" in payload
    assert "summary" in payload
    assert "praise" in payload

    # 2. Empty filtered preview (must not crash)
    empty_res = client.get("/api/report/preview?category=NonExistentCategory")
    assert empty_res.status_code == 200
    empty_payload = empty_res.json()
    assert empty_payload["overview"]["total"] == 0
    assert len(empty_payload["priorities"]) == 0


def test_csv_exports():
    res_pr = client.get("/api/export/priorities.csv")
    assert res_pr.status_code == 200
    assert "text/csv" in res_pr.headers.get("content-type", "")
    assert b"rank,issue,category" in res_pr.content

    res_fb = client.get("/api/export/feedback.csv")
    assert res_fb.status_code == 200
    assert "text/csv" in res_fb.headers.get("content-type", "")
    assert b"id,created_at,category" in res_fb.content


def test_adaption_self_healing_and_reset():
    from app import adaption_pipeline
    import json

    # Simulate an orphaned "running" state left by an interrupted process
    adaption_pipeline._write_state(status="running", step="Simulated orphaned step")

    # 1. GET /api/adaption must detect orphaned thread, heal state to failed, and report is_active=False
    res = client.get("/api/adaption")
    assert res.status_code == 200
    data = res.json()
    assert data["is_active"] is False
    assert data["state"]["status"] == "failed"
    assert "interrupted" in data["state"]["error"].lower()

    # 2. POST /api/adaption/reset resets state back to idle
    reset_res = client.post("/api/adaption/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["ok"] is True
    assert reset_res.json()["state"]["status"] == "idle"

    # 3. GET /api/adaption confirms idle status
    after_reset = client.get("/api/adaption").json()
    assert after_reset["is_active"] is False
    assert after_reset["state"]["status"] == "idle"


def test_adaption_error_cause_and_redaction(monkeypatch):
    from app import adaption_pipeline, config

    test_key = "test_secret_key_12345"
    monkeypatch.setattr(config, "ADAPTION_API_KEY", test_key)

    class MockDatasets:
        def upload_file(self, *args, **kwargs):
            cause = Exception(f"Illegal header value Bearer {test_key}")
            exc = RuntimeError("Connection error.")
            exc.__cause__ = cause
            raise exc

    class MockClient:
        datasets = MockDatasets()

    monkeypatch.setattr("adaption.Adaption", lambda **kw: MockClient())

    with pytest.raises(RuntimeError):
        adaption_pipeline.run_pipeline(estimate_only=True)

    state = adaption_pipeline.read_state()
    assert state["status"] == "failed"
    assert "Connection error." in state["error"]
    assert test_key not in state["error"]
    assert "[REDACTED]" in state["error"]
    assert "Illegal header value" in state["error"]
    adaption_pipeline.reset_state()

