"""Run the Adaption enrichment from the command line.

Usage (from the backend folder):
    export ADAPTION_API_KEY=...
    python -m scripts.run_adaption --estimate     # price it first, nothing is charged
    python -m scripts.run_adaption                # full run on every unique review
    python -m scripts.run_adaption --max-rows 50  # small trial run

Results are written to data/adaption_results.json. Commit that file so the
deployed app (and the demo) can show Adaption results without calling the API.
"""

import argparse
import json

from app import adaption_pipeline
from app.db import init_db


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--estimate", action="store_true", help="only return the credit estimate")
    parser.add_argument("--max-rows", type=int, default=None)
    args = parser.parse_args()

    init_db()
    result = adaption_pipeline.run_pipeline(max_rows=args.max_rows, estimate_only=args.estimate)
    summary = {k: v for k, v in result.items() if k != "results"}
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
