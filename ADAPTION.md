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

## Running it

From the app: Insights page, then "Get estimate" and "Run enrichment" (needs `ADAPTION_API_KEY` on the backend).

From the command line:

```bash
cd backend
export ADAPTION_API_KEY=...
python -m scripts.run_adaption --estimate    # price only, nothing charged
python -m scripts.run_adaption --max-rows 50 # small trial
python -m scripts.run_adaption               # every unique review
```

Results are cached in `backend/data/adaption_results.json`. Commit that file and the deployed app shows Adaption results immediately, even if the API is slow or out of credits during the demo.

## Code

`backend/app/adaption_pipeline.py`
