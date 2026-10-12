# InsightFlow

Turn raw customer feedback into clear priorities. InsightFlow reads every review, groups the ones that say the same thing, shows how sentiment changes over time, and ranks which problem to fix first, with the reasons spelled out.

Built for Frontend Arena Build Battle 2026 (AI x Web Development).

## What it does

| Requirement | Where it lives |
|---|---|
| Submit feedback, import CSV, sample data | **Feedback** page: add one review, import any CSV, or load the Build Battle dataset |
| Search, filter, organize | **Feedback** page: search, category and sentiment filters, period, group repeats, sort |
| Sentiment, recurring topics, common complaints | Every review gets sentiment, a topic and a severity from 0 to 5 |
| Group similar feedback | **Insights** page: 20 phrasings of the same problem count as one topic |
| Adaption in the AI workflow | Adaption enriches each unique review and grades data quality. See [ADAPTION.md](ADAPTION.md) |
| Key metrics, sentiment split, top issues, trends | **Dashboard** |
| Filter by category, sentiment, date | One filter bar on every page, kept in the URL so views can be shared |
| High-priority issues with reasons and actions | **Priorities** page: a score built from volume, negativity, severity and growth |
| Save and track issues | **Tracker** page: open, in progress, resolved, with owner and notes |
| Export and share a report | **Insight report**: save as PDF, share a read-only link, download CSVs |

## The one thing worth knowing about the dataset

The file has 7,000 rows, but only **320 are unique**. The other 6,680 are repeats. So InsightFlow analyzes each unique text once and reuses the result for every copy, and it treats the repeat count as a signal of how often a problem comes up. The Import health panel shows this on every import.

The file also has no dates. To show trends, rows get timestamps spread over the last 90 days, from a fixed seed so the numbers are the same every time. The interface labels these as simulated. Feedback you add by hand, or a CSV with a date column, uses real dates.

## How analysis works

Three engines, used in this order for each unique review:

1. **Adaption** results, when a run has been done (see ADAPTION.md)
2. **Claude**, for new free-form feedback the rules cannot place, when `ANTHROPIC_API_KEY` is set
3. **Topic rules** plus VADER sentiment. Always available, no network needed

The topic rules were written after reading all 320 unique reviews. They place every one of them, and they also handle free-form text like "my refund still has not arrived".

### The priority score

```
score = 100 x confidence x (0.35 volume + 0.25 negativity + 0.25 severity + 0.15 growth)
```

- **Volume**: reports for this topic divided by the biggest complaint
- **Negativity**: share of fully negative reports, partly fixed ones count half
- **Severity**: average harm to the customer, 1 (annoyed) to 5 (lost money), divided by 5
- **Growth**: last 14 days vs the 14 before, neutral when there is not enough history
- **Confidence**: damps topics with fewer than 30 reports, so one loud review cannot outrank a real pattern

Every part is shown on the Priorities page next to the score.

## Run it locally

You need Python 3.11+ and Node 20+.

```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # add keys if you have them, all optional
uvicorn app.main:app --reload --port 8000

# 2. Frontend, in a second terminal
cd frontend
npm install
cp .env.example .env.local    # points at http://localhost:8000
npm run dev
```

Open http://localhost:3000. The backend loads the sample dataset on first start.

## Deploy

**Backend on Render.** Push the repo to GitHub, then in Render choose New > Blueprint and select the repo. `render.yaml` sets everything up. Add `ADAPTION_API_KEY` in the dashboard. The free plan has no persistent disk, so the database resets on restart (the sample reloads by itself). For data that survives restarts, set `DATABASE_URL` to a Postgres database such as Supabase.

**Frontend on Vercel.** Import the repo, set the root directory to `frontend`, and add `NEXT_PUBLIC_API_URL` with your Render URL. Then set `CORS_ORIGINS` on Render to your Vercel URL.

## Project layout

```
backend/
  app/
    taxonomy.py          topics, rules, severity and recommended actions
    analysis.py          rules, VADER and Claude engines
    adaption_pipeline.py upload, adapt, evaluate, download, merge
    ingest.py            CSV import, dedupe, timestamps, import health
    insights.py          dashboard numbers, topics, priority score, report
    main.py              API routes
  scripts/run_adaption.py
  data/sample_feedback.csv
frontend/
  src/app/               landing page and the six screens
  src/components/        charts, terrain hero, filter bar, report view
```

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/overview` | Dashboard numbers. Takes `category`, `sentiment`, `topic`, `q`, `date_from`, `date_to` |
| GET | `/api/feedback` | Paged feedback list. Add `group=true` to collapse repeats |
| POST | `/api/feedback` | Add one review, returns its analysis |
| POST | `/api/feedback/import` | Import a CSV (multipart `file`) |
| POST | `/api/feedback/sample` | Load the sample dataset |
| GET | `/api/topics` | Topics with counts, phrasings, examples and weekly trend |
| GET | `/api/priorities` | Ranked complaints with score parts, reasons and actions |
| GET/POST/PATCH/DELETE | `/api/issues` | Issue tracker |
| GET/POST | `/api/reports` | Create and read shareable report snapshots |
| GET | `/api/export/priorities.csv`, `/api/export/feedback.csv` | CSV exports |
| GET/POST | `/api/adaption`, `/api/adaption/run` | Adaption status and runs |
