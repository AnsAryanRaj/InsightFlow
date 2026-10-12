# How InsightFlow uses Adaption

## In one paragraph

Adaption's Adaptive Data API takes a dataset with a prompt column, generates a completion for every row, removes near-duplicates, flags unsafe content, and grades the data quality before and after. InsightFlow points that pipeline at customer feedback. Each unique review is the prompt, its category is the context, and a blueprint (Adaption's system-prompt control) tells Adaption to write the completion as a structured analysis of that review. The adapted dataset comes back as the analysis for every review, and the quality grades appear on the Insights page.

## The flow

1. **Upload.** InsightFlow collects the unique reviews (320 for the sample, not 7,000 repeats) and uploads them with `client.datasets.upload_file`.
2. **Estimate.** `client.datasets.adapt(..., estimate=True)` returns the credit cost and time before anything is charged. The Insights page shows it.
3. **Adapt.** The real run uses:
   - `column_mapping`: `prompt = review`, `context = [category]`
   - `recipe_specification`: `deduplication` on, so near-identical phrasings are merged
   - `brand_controls.blueprint`: the analyst instructions below
   - `brand_controls.safety_categories`: harassment, hate, violence, so abusive feedback is flagged
4. **Evaluate.** `client.datasets.wait_for_evaluation` returns grade and score before and after adaptation. These show as "Quality before / after / improvement".
5. **Merge.** `client.datasets.download(file_format="csv")` returns the adapted rows. Each completion is parsed as JSON and stored as that review's analysis with `engine = "adaption"`. If a completion cannot be parsed, the topic rules fill in, so nothing breaks.

## The blueprint

```
You are a customer-insight analyst for an e-commerce marketplace.
The prompt is one customer review. The context gives the category it was filed under.
Reply with ONLY one JSON object and no other text, in this exact shape:
{"sentiment": "positive|mixed|negative", "topic": "<topic id>", "severity": <0-5>,
  "summary": "<at most 10 words>", "action": "<one concrete step the business should take>"}
Rules: "mixed" means a complaint the business partly fixed. Severity is 0 for praise and
5 when the customer lost money or was defrauded. Choose topic from: <list of topic ids>.
```

## Why this is a meaningful part of the workflow

- Adaption produces the per-review analysis that feeds every chart, the topic grouping and the priority score.
- Its deduplication matches the biggest finding in this dataset: most feedback is the same few messages repeated.
- Its quality evaluation gives the business a grade for its own feedback data, shown on the Insights page.
- Safety screening flags abusive reviews without deleting them.

## Setup and Configuration

1. **Obtain an Adaption API Key** from the Adaption dashboard.
2. **Set the key exclusively in backend environment configuration:**
   - **Local development:** Add `ADAPTION_API_KEY=your_key_here` to `backend/.env`.
   - **Render deployment:** Under service `insightflow-api` > Environment Variables, add `ADAPTION_API_KEY`.
   - *Never commit API keys to Git or expose them in client-side code.*

## Running the Pipeline

### Option A: From the Web UI
1. Navigate to the **Insights** page (`/insights`).
2. If `ADAPTION_API_KEY` is not set, the panel clearly indicates **"Running on local rules"** mode.
3. Once configured, click **"Get estimate"** to query Adaption for estimated credits and minutes without being charged.
4. Click **"Run enrichment"** to launch the asynchronous background job.
5. The UI polls `/api/adaption` every 3 seconds to report live progress (`Uploading`, `Adapting`, `Evaluating`, `Done`).
6. Upon completion, new quality grades and enrichment counts appear instantly, and the page metrics refresh automatically.

### Option B: From the Command Line
```bash
cd backend

# On Linux/macOS:
export ADAPTION_API_KEY=your_key_here
# On Windows PowerShell:
$env:ADAPTION_API_KEY="your_key_here"

# 1. Pre-flight price and time estimate (no credits billed):
python -m scripts.run_adaption --estimate

# 2. Small trial batch (e.g., first 50 unique reviews):
python -m scripts.run_adaption --max-rows 50

# 3. Full run (all 320 unique reviews):
python -m scripts.run_adaption
```

## Expected Duration & Limitations

- **Deduplication efficiency:** The 7,000 feedback rows are deduplicated down to 320 unique review texts before uploading. Only 320 prompt rows are billed and processed.
- **Duration:** Typically **2 to 5 minutes** for the 320-row dataset depending on remote queue depth.
- **Timeouts:** The pipeline sets a 60-minute wait timeout (`wait_for_completion(timeout=3600)`) and a 10-minute evaluation timeout (`wait_for_evaluation(timeout=600)`).
- **Concurrency control:** An in-process thread lock prevents competing simultaneous runs.

## Verification of Results

1. **Cache File Generated:** Results are persisted to `backend/data/adaption_results.json` containing:
   - `dataset_id`: Adaption dataset ID.
   - `created_at` and `applied_at`: Timestamps.
   - `evaluation`: Pre- and post-adaptation data quality scores and letter grades.
   - `results`: Array of per-review structured analyses with `engine: "adaption"`.
2. **Database Updated:** Each unique review's record in the SQLite `analysis` table is updated with `engine = "adaption"`.
3. **UI Verification:**
   - On the **Insights** page, the panel displays the exact number of enriched reviews, quality grades before/after, and percentage improvement.
   - On the **Feedback** explorer, items analyzed by Adaption display the tag `read by adaption`.
   - On the **Dashboard**, the "Analysis engines" count in executive reports includes Adaption.

## Safe Fallback Behavior

- **Missing Key:** If `ADAPTION_API_KEY` is omitted, InsightFlow operates in 100% offline local mode using rule-based taxonomy and VADER sentiment. No features crash.
- **Parsing / Network Failures:** If an individual completion cannot be parsed as JSON, the pipeline falls back to rule-based analysis for that item, ensuring zero data loss.
- **Evaluation Unavailable:** Data quality evaluation is treated as a bonus and never fails an otherwise successful run.
- **Idempotent Caching:** Once `backend/data/adaption_results.json` exists, the backend reloads and applies it on startup without needing to re-bill credits.

## Code References

- Pipeline logic: [`backend/app/adaption_pipeline.py`](backend/app/adaption_pipeline.py)
- REST API routes: [`backend/app/main.py`](backend/app/main.py)
- CLI runner: [`backend/scripts/run_adaption.py`](backend/scripts/run_adaption.py)
- Insights UI panel: [`frontend/src/components/AdaptionPanel.tsx`](frontend/src/components/AdaptionPanel.tsx)

