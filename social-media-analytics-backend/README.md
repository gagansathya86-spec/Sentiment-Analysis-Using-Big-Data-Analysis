# Social Media Sentiment & Behavior Analytics — Backend

A FastAPI backend implementing the methodology from *"Big Data Based Social
Media Sentiment Analysis and User Behavior Mining"*:

```
Social Media Dataset
      │
Data Preprocessing            (URL/mention/emoji/number/stopword removal, stemming)
      │
Hadoop/HDFS distributed storage    ┐
      │                            │  ProcessingEngine interface —
Apache Spark processing            ┘  pandas locally, Spark/HDFS in production
      │
User Behavior Mining          (posting frequency, engagement, activity-by-time-of-day)
      │
NLP preprocessing → TF-IDF → Multinomial Naive Bayes
      │
Positive / Negative / Neutral
      │
Analytics & Visualization APIs
```

No external AI APIs are used for sentiment classification. The prediction
model is **TF-IDF + Multinomial Naive Bayes** (scikit-learn), not an LLM,
VADER, TextBlob, or Transformer. Live Facebook Graph access separately
requires a Facebook access token in `.env`.

## Project layout

```
backend/
  api/            FastAPI routers (upload, dataset, sentiment, analytics)
  services/       Business logic: dataset_service, model_service, processing_engine
  nlp/            Text preprocessing + TF-IDF vectorizer
  analytics/      User behavior mining, sentiment analytics, keyword analysis
  models/         Pydantic schemas + the SentimentModel (TF-IDF + MultinomialNB)
  data/           uploads/, processed/, trained_models/ (created automatically)
  utils/          File registry + column auto-detection helpers
  main.py         FastAPI app / route registration
  config.py       Settings, all read from environment variables
  requirements.txt
  .env / .env.example
```

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env            # already provided as .env — edit if needed

python3 -c "import nltk; nltk.download('stopwords')"   # one-time, offline after this

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000/docs** for interactive Swagger UI, or
**http://localhost:8000/redoc** for ReDoc.

No key is needed for offline sentiment analysis. Live Facebook and HDFS
integrations use backend-only secrets configured in `.env`.

## Facebook token renewal and storage

The Facebook connection uses a **User Access Token** to discover managed Pages
through `/me/accounts`, then uses the returned **Page Access Token** for the
selected Page. Page tokens are held only in backend memory and are reacquired
after a restart or when the user token changes. Settings saves a replacement
user token encrypted in SQLite; configure `FACEBOOK_TOKEN_ENCRYPTION_KEY`
before saving. Generate a Fernet key once and keep the same value across
restarts/backups:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put that output in the backend `.env` as `FACEBOOK_TOKEN_ENCRYPTION_KEY=...`.
Never commit `.env` or share the key. When a token has expired or been revoked,
Meta requires renewed user authorization; the backend stops retrying that
token and Settings provides the reconnect/test flow. In Meta Graph API Explorer,
select the existing Facebook app and create a fresh **User Access Token** with
`pages_show_list`, `pages_read_engagement`, and `pages_read_user_content`.
Paste it into **Settings → Meta Graph API Configuration**, save, then test the
connection and confirm the target Page and permissions before syncing comments.
`pages_read_user_content` may require Advanced Access/App Review for accounts
outside the app's roles. A valid user token is not sufficient if the user lacks
access to the target Page or the Page is not returned by `/me/accounts`.

## Instagram Professional account

Instagram uses the same encrypted Meta user token and discovers linked
Business/Creator accounts through managed Facebook Pages. Optionally set
`INSTAGRAM_PAGE_ID` and `INSTAGRAM_ACCOUNT_ID` in the backend `.env` to pin the
linked account; leave them blank to discover an account from the managed/selected
Page. The protected `/instagram/status` endpoint checks the current token's
reported grants through `/me/permissions`. This is not a substitute for each
Graph API operation: account eligibility, app review, and API-version support
can still cause media, comment, or insights requests to be rejected.

Select Instagram in the app's platform control, then use **Instagram Account →
Sync Media** to store current Graph API media before analyzing captions or using
the shared dashboards. The Facebook Login flow requires a linked Professional
account and cannot access consumer accounts. Unsupported metrics remain
unavailable instead of being recorded as zero.

## Local dev mode vs. real Hadoop/Spark

`config.py` → `PROCESSING_ENGINE` controls this:

- `PROCESSING_ENGINE=pandas` (default) — dataset transformations run
  locally with pandas and local files. This does not represent HDFS storage.
  Facebook records use the separate `HDFS_WEBHDFS_URL` sink when configured.
- `PROCESSING_ENGINE=spark` — switches to `SparkProcessingEngine`
  (`services/processing_engine.py`), which reads/writes through a real
  HDFS namenode (`HDFS_NAMENODE_URL`) and processes with PySpark
  (`SPARK_MASTER_URL`). Requires `pip install pyspark` and a reachable
  cluster. Every other module in the codebase (dataset service, model
  service, analytics) talks only to the `ProcessingEngine` interface, so
  no other code changes are needed to move from dev to a real cluster.

For application login and verified Facebook WebHDFS export/backfill setup,
see the repository's `AUTH_HDFS_SETUP.md`.

## API walkthrough

1. **`POST /api/upload`** — multipart CSV upload. Returns a `dataset_id`
   and an auto-detected column mapping (text/sentiment/timestamp/
   likes/comments/shares/user/platform), guessed from common column-name
   patterns. You can override any of these later via the `mapping` field
   on `/preprocess` or `/train` if your CSV uses unusual column names.

2. **`GET /api/datasets/{id}/preview`** — first N rows.

3. **`GET /api/datasets/{id}/missing-values`** — missing-value counts and
   percentages per column.

4. **`GET /api/datasets/{id}/duplicates`** — duplicate-row count and
   sample indices.

5. **`POST /api/datasets/{id}/preprocess`** — runs the full text pipeline
   (URL/mention/emoji/number/punctuation removal → lowercase → stopword
   removal → tokenize → stem) plus missing/duplicate row handling, and
   persists a processed dataset.

6. **`POST /api/sentiment/train/{id}`** — vectorizes `processed_text`
   with TF-IDF, trains Multinomial Naive Bayes against your labeled
   sentiment column, and returns accuracy, precision/recall/F1 (per
   class + macro + weighted), and the confusion matrix.

7. **`POST /api/sentiment/predict-text`** — predicts sentiment for
   arbitrary new text using the trained model.

8. **`POST /api/sentiment/predict-dataset/{id}`** — predicts sentiment
   for every row of the dataset (useful when there's no ground-truth
   label column) and saves the predictions for the analytics endpoints
   below to use.

9. **Analytics** (`/api/analytics/{id}/...`):
   - `posting-frequency` — posts by date / day-of-week
   - `activity-time-of-day` — morning/afternoon/evening/night buckets +
     hourly breakdown
   - `engagement` — likes/comments/shares totals, averages, top posts
   - `behavior-summary` — the three above, combined
   - `sentiment-distribution` — counts + percentages per class
   - `sentiment-trends` — sentiment counts per day over time
   - `keywords` — top terms overall (frequency + TF-IDF) and per
     sentiment class
   - `dashboard` — everything above in one response

## Testing

The full pipeline (upload → preview → missing/duplicate detection →
preprocess → train → predict → every analytics endpoint) was tested
end-to-end against a synthetic 300-row sample dataset before delivery,
including error-handling paths (missing dataset, wrong file type,
training before preprocessing, predicting before training) and an
auto-column-detection regression test against non-standard column names
(`msg`, `label`, `posted_on`). All checks passed.

To try it yourself, a script to generate a synthetic sample CSV is not
included in the delivered project (it was only a test fixture), but any
CSV with a free-text column and, for training, a positive/negative/neutral
label column will work — the upload response tells you what columns it
detected.

## Notes on the CSV format

The backend doesn't require fixed column names. At minimum you need a
free-text column (auto-detected from names like `text`, `content`,
`post`, `comment`, `tweet`, `message`, `body`, `review`, `caption`). For
training you also need a sentiment/label column (`sentiment`, `label`,
`class`, `polarity`) containing values like `positive` / `negative` /
`neutral`. Optional columns for richer analytics: a timestamp column, and
likes/comments/shares columns.
