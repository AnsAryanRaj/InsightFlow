import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Reads KEY=value lines from backend/.env without overriding real environment variables."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip(), value)


_load_dotenv(BASE_DIR / ".env")
DATA_DIR = Path(os.getenv("INSIGHTFLOW_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DATA_DIR / 'insightflow.db'}"
SAMPLE_CSV = BASE_DIR / "data" / "sample_feedback.csv"
ADAPTION_STATE_FILE = DATA_DIR / "adaption_state.json"
ADAPTION_RESULTS_FILE = BASE_DIR / "data" / "adaption_results.json"

ADAPTION_API_KEY = os.getenv("ADAPTION_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")

# Comma separated list of allowed frontend origins for CORS
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# The dataset has no dates, so imported rows get simulated timestamps across this window
SIMULATED_WINDOW_DAYS = int(os.getenv("SIMULATED_WINDOW_DAYS", "90"))
SIMULATION_SEED = int(os.getenv("SIMULATION_SEED", "2026"))
