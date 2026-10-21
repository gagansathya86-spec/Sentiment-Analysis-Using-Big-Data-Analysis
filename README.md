# Sentiment Analysis Using Big Data Analysis
### Facebook Social Intelligence & Crisis Monitoring Platform
**A College Major Project for Big Data Analytics and Natural Language Processing**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.111-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_%2B_Vite-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Scikit-Learn](https://img.shields.io/badge/ML-TF--IDF_%2B_MultinomialNB-F7931E.svg?logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Meta Graph API](https://img.shields.io/badge/Meta_Graph_API-v21.0-0668E1.svg?logo=meta&logoColor=white)](https://developers.facebook.com/)
[![License](https://img.shields.io/badge/License-Academic_Evaluation-blue.svg)]()

---

## 1. Project Overview & Architecture

This project upgrades an academic big data sentiment analysis application into a **Facebook Social Analytics & Intelligence Platform** (**NexusIntel v2.0**). It combines live Facebook Page ingestion via the **Meta Graph API (v21.0)** with dataset pipelines, sentiment classification, clause-level Aspect-Based Sentiment Analysis (ABSA), viral post potential estimation, explainable recommendations, and crisis alert surveillance.

### System Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Meta Graph API (v21.0)                 │
                  │   ┌─────────────────────┐    ┌─────────────────────┐   │
                  │     Facebook Page Graph API (Posts & Comments)     │
                  └──────────────────────────┬─────────────────────────┘
                                             │
                                             ▼
               ┌───────────────────────────────────────────────────────────┐
               │           Unified Social Ingestion & Normalizer           │
               │   (Common schema: platform, post_id, text, metrics, time) │
               └─────────────────────────────┬─────────────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │  ProcessingEngine (PaaS)  │               │   SQLite Persistence DB   │
         │   • Pandas Engine (Dev)   │               │   (`social_feed.db`)      │
         │   • PySpark Engine (HDFS) │               │   Posts, Comments, Alerts │
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       │                                           │
                       ▼                                           │
         ┌───────────────────────────┐                             │
         │  NLP Preprocessing Engine │                             │
         │   • Lowercasing/Cleaning  │                             │
         │   • URL/Emoji/Mention Stri│                             │
         │   • NLTK Stopwords/Stem   │                             │
         └─────────────┬─────────────┘                             │
                       │                                           │
         ┌─────────────┴─────────────┐                             │
         ▼                           ▼                             ▼
┌─────────────────┐         ┌─────────────────┐       ┌────────────────────────┐
│ Sentiment Model │         │ Model Benchmark │       │   Advanced Analytics   │
│ TF-IDF + Multi- │         │ MultinomialNB vs│       │ • Aspect Analysis ABSA │
│ nomialNB (77%+) │         │ LogReg vs LinSVM│       │ • Engagement Dynamics  │
└────────┬────────┘         └─────────────────┘       │ • Viral Post Potential │
         │                                            │ • Crisis Spike Alerts  │
         │                                            │ • Trend / Hashtag Cloud│
         └───────────────────────────┬────────────────┴────────────┬───────────┘
                                     │                             │
                                     ▼                             ▼
                  ┌────────────────────────────────────────────────────────┐
                  │               FastAPI High-Speed REST API              │
                  │     (59 Validated Endpoints across 13 Service Modules) │
                  └──────────────────────────┬─────────────────────────────┘
                                             │ JSON REST
                                             ▼
                  ┌────────────────────────────────────────────────────────┐
                  │          React 18 + Vite Modern Glassmorphism UI       │
                  │   Command Center, Unified Feed, Recharts, Print Dossier│
                  └────────────────────────────────────────────────────────┘
```

---

## 2. Technology Requirements & Stack

### Backend
- **Framework**: Python 3.10+ with [FastAPI](https://fastapi.tiangolo.com/) and [Uvicorn](https://www.uvicorn.org/) ASGI.
- **Machine Learning**: `scikit-learn` using **TF-IDF Vectorization** (n-grams 1-2, sublinear TF) + **Multinomial Naive Bayes** (`MultinomialNB`).
- **Benchmark Suite**: Stratified 80/20 train/test evaluation comparing **MultinomialNB**, **Logistic Regression**, and **Linear Support Vector Machines (SGDClassifier)**.
- **Data Persistence**: Lightweight SQLite database (`data/social_feed.db`) with automatic schema initialization and pre-seeded sample data.
- **Big Data Abstraction Layer**: Dual-mode `ProcessingEngine` supporting local **Pandas** and cluster-scale **Apache Spark (PySpark) + Hadoop HDFS**.

### Frontend
- **Framework**: React 18 with [Vite](https://vitejs.dev/) for lightning-fast HMR and optimized production bundles.
- **Visuals & Charts**: [Recharts](https://recharts.org/) (Interactive Donut, Stacked Bar, Composed Line/Area, Scatter plots) and custom CSS glassmorphism design system.
- **Animations & Icons**: [Framer Motion](https://www.framer.com/motion/) micro-interactions and SVG brand icons.
- **Print & Dossier**: CSS Print Media formatting for instant Executive PDF export.

---

## 3. Meta Graph API Integration (Facebook)

### Supported Authentication Flows
The platform supports Meta Graph API v21.0:
1. **Facebook Integration**:
   - Queries `/{page_id}/feed?fields=id,message,created_time,shares,reactions.summary(true),comments.summary(true)`.
   - Fetches post comments via `/{post_id}/comments`.
   - Runs text through the sentiment pipeline and normalizes engagement.

### Required Meta Developer Permissions
To connect live Meta accounts, your Meta Developer App requires:
| Permission Name | Purpose |
| :--- | :--- |
| `pages_show_list` | Discover pages managed by the user |
| `pages_read_engagement` | Retrieve Facebook post likes, shares, and engagement |
| `pages_manage_posts` / `pages_read_user_content` | Retrieve post and comment text |

> [!IMPORTANT]
> **Offline & Evaluation Fallback**: If a live Meta token is unavailable, the application provides diagnostic messages and can serve Facebook demonstration records (`is_sample=1`) for evaluating analytics offline.

---

## 4. Advanced Analytics Features

### A. Aspect-Based Sentiment Analysis (ABSA)
Extracts clause-level opinions across configured Facebook topics including:
- `Product Quality`
- `Price & Value`
- `Customer Service`
- `Delivery & Logistics`
- `Usability & UI`
- `Reliability & Bugs`
- `General Feedback`
- `Location`

Uses explainable keyword matching and clause-local opinion cues. Negation is handled with a short local scope; mixed opinions remain separate (e.g., *"The camera is excellent, but the battery is terrible"*). Parent post sentiment is not copied to an aspect. This lightweight lexicon approach can miss sarcasm and implicit topics.

### B. Engagement Analytics
Calculates Facebook interaction dynamics using the standardized social formula:
$$\text{Engagement Score} = \text{Likes} + (2 \times \text{Comments}) + (3 \times \text{Shares})$$
- Explores engagement vs. sentiment correlation.
- Computes optimal posting hours and peak engagement days.
- Separates descriptive statistics from predictive modeling.

### C. Viral Post Potential Estimation
A transparent, experimental heuristic score ($0 - 100$) evaluating available engagement volume, comment-to-reaction ratio, sentiment confidence, historical Facebook posting-hour performance, and share activity or topic tags. It is not a trained or calibrated probability. The database has no engagement snapshots, so engagement growth is not measured. Missing metrics are surfaced as unavailable.

Includes an interactive **Viral Simulator** where marketing drafts can be tested before posting.

### D. Negative Sentiment Spikes & Crisis Alerts
Compares consecutive timestamped windows ending at the latest stored Facebook item (default: 7 days each). A potential-issue alert requires the minimum sample size in both windows (default: 3) and a negative-sentiment rise at or above the configured threshold (default: 35 percentage points). Evidence includes both period ratios, terms, detected aspects, and example comments/posts. Alerts indicate a potential issue, not a confirmed crisis; absent/insufficient history does not trigger an alert.

### E. Trend & Keyword Discovery
- N-gram term extraction with stopword removal.
- Distinctive term mining for Facebook discourse.
- Live hashtag frequency and recent topic counts compared with the preceding timestamped window. Window length is selectable in the Trends view. Periods are data-relative and are unavailable when timestamps or records are missing.

---

## 5. Machine Learning & Model Benchmark

The system benchmarks multiple NLP classification models against the **Sentiment140** benchmark:
- **Baseline Model**: TF-IDF (5,000 max features, sublinear TF, unigrams + bigrams) + **Multinomial Naive Bayes** (`alpha=1.0`).
- **Logistic Regression**: L2 regularization with L-BFGS solver.
- **Linear Support Vector Classifier**: Stochastic Gradient Descent with modified Huber loss for probability calibration.

### Model Comparison Metrics (80/20 Train/Test Split)
| Algorithm | Accuracy | Macro Precision | Macro Recall | Macro F1-Score | Inference Latency |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Multinomial Naive Bayes** *(Default)* | **77.4%** | **78.1%** | **77.4%** | **0.773** | **0.8 ms** |
| **Logistic Regression (L2)** | 78.9% | 79.2% | 78.9% | 0.789 | 1.4 ms |
| **Linear SVM (SGD)** | 77.8% | 78.3% | 77.7% | 0.776 | 1.1 ms |

---

## 6. Installation & Quick Start

### Prerequisites
- Python 3.10 or higher
- Node.js 18+ and npm
- Git

### 1. Backend Setup
```bash
# Navigate to backend directory
cd social-media-analytics-backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Download required NLTK stopwords (one-time setup)
python -c "import nltk; nltk.download('stopwords')"

# Copy and configure environment variables
cp .env.example .env

# Run FastAPI backend server
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
API Documentation will be live at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup
```bash
# Open a new terminal and navigate to frontend directory
cd social-media-analytics-frontend

# Install node dependencies
npm install

# Start Vite development server
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 7. Environment Configuration (`.env`)

Create a `.env` file in `social-media-analytics-backend/` based on `.env.example`:

```ini
# Processing Engine: 'pandas' for local development or 'spark' for HDFS cluster
PROCESSING_ENGINE=pandas

# Meta Graph API Configuration
META_ACCESS_TOKEN=your_meta_system_or_user_access_token_here
META_API_VERSION=v21.0
FACEBOOK_PAGE_ID=your_facebook_page_id_here

# Required rise in negative sentiment, in percentage points
ALERT_NEGATIVE_THRESHOLD=35.0
ALERT_MIN_SAMPLE_SIZE=3
```

> [!CAUTION]
> Private access tokens and secrets must never be committed to Git. `.env` is explicitly included in `.gitignore`.

---

## 8. REST API Endpoints Directory

### Facebook Analytics (`/api/unified`)
- `GET /api/unified/status` - Facebook connection status and record counts.
- `GET /api/unified/metrics` - Facebook post and comment metrics.
- `GET /api/unified/feed` - Filtered Facebook feed with pagination and keyword search.
- `GET /api/unified/charts` - Sentiment, timeline, and Facebook post metrics.
- `POST /api/unified/seed-sample` - Load Facebook demonstration data.
- `GET /api/unified/export` - Export Facebook records to CSV.

### Facebook Graph API (`/facebook`)
- `GET /facebook/status` - Verify Facebook Page token and account connectivity.
- `GET /facebook/posts` - Fetch Facebook posts and engagement statistics.
- `POST /facebook/analyze` - Run sentiment analysis on Facebook posts.
- `GET /facebook/posts/{post_id}/comments` - Retrieve Facebook comments.
- `POST /facebook/posts/{post_id}/comments/analyze` - Run sentiment analysis on comments.
- `POST /facebook/import-dataset` - Import Facebook feed into dataset pipeline.

### Aspect-Based Sentiment Analysis (`/api/aspects`)
- `GET /api/aspects/summary` - Aggregated polarity counts for configured Facebook aspects, including mixed-item counts.
- `GET /api/aspects/config` - Get active commercial aspect definitions.
- `POST /api/aspects/config` - Update or customize commercial aspect keywords.
- `POST /api/aspects/analyze-text` - Live sandbox: test arbitrary text for clause-level aspects.

### Engagement Analytics (`/api/engagement-stats`)
- `GET /api/engagement-stats/summary` - Aggregate likes, comments, shares, and engagement rates.
- `GET /api/engagement-stats/by-platform` - Facebook engagement metrics.
- `GET /api/engagement-stats/top-posts` - Ranked list of highest-performing content.
- `GET /api/engagement-stats/sentiment-correlation` - Interaction distribution across sentiment classes.
- `GET /api/engagement-stats/best-posting-times` - Heatmap analysis of high-engagement time windows.

### Viral Post Potential (`/api/viral`)
- `GET /api/viral/ranked-posts` - Facebook posts ranked by explainable viral potential score (0-100).
- `GET /api/viral/recommendations` - Recommendations with observed Facebook analytics as evidence.
- `POST /api/viral/score-draft` - Score draft copy and show the factor breakdown.

### Crisis Alerts & Incident Surveillance (`/api/alerts`)
- `GET /api/alerts` - Historical Facebook alerts, status filters, and summary.
- `POST /api/alerts/refresh` - Compare the newest timestamped window with its predecessor.
- `POST /api/alerts/{alert_id}/status` - Update alert status (`reviewed` or `resolved`).
- `GET /api/alerts/config` / `POST /api/alerts/config` - Read or update rise threshold and minimum sample size.

### Trend & Keyword Discovery (`/api/trends-discovery`)
- `GET /api/trends-discovery/summary?platform=facebook&period_days=7` - Keywords, hashtags, daily sentiment, consecutive-period comparison, and timestamp-based emerging topics.

### Model Evaluation & Benchmark (`/api/sentiment`)
- `GET /api/sentiment/models` - Registered sentiment models metadata.
- `POST /api/sentiment/compare-demo` - Side-by-side benchmark of Naive Bayes, Logistic Regression, and SVM.
- `POST /api/sentiment/train/{dataset_id}` - Train Naive Bayes model on uploaded dataset.
- `POST /api/sentiment/predict-text` - Predict sentiment for custom single string.

### System Settings & Diagnostics (`/api/settings`)
- `GET /api/settings/status` - Comprehensive diagnostics of backend, database, and Meta tokens.
- `POST /api/settings/test-meta` - Test live connectivity against Meta Graph API.
- `POST /api/settings/credentials` - Update runtime Meta tokens and credentials.

---

## 9. Viva / College Evaluation Demonstration Script

Follow this step-by-step walkthrough to present the project to academic examiners:

### Step 1: System Architecture & Command Center (`/dashboard`)
1. Open `http://localhost:5173/dashboard`.
2. Explain the **Facebook Analytics** view:
   - Highlight Facebook posts and comments ingested.
   - Point to the Facebook Page connection status.
   - Showcase the **Facebook Sentiment Share** chart and post engagement metrics.

### Step 2: Facebook Analytics (`/unified`)
1. Navigate to **Facebook Analytics** in the sidebar.
2. Review Facebook metrics, sentiment charts, and the normalized feed.
3. Demonstrate the **Export CSV** button for stored Facebook records.

### Step 4: Aspect-Based Sentiment Analysis (ABSA) (`/aspects`)
1. Navigate to **Aspect-Based ABSA** in the sidebar.
2. Explain how ABSA overcomes traditional document-level sentiment:
   - Review configured dimensions (*Product Quality, Customer Service, Delivery, Location, etc.*).
   - Show how the system captures positive and negative quotes under each dimension.
3. In the **Live Clause-Level Aspect Analyzer**:
   - Enter: `"The camera is excellent, but the battery is terrible. Customer support never answered."`
   - Click **Analyze Aspect Clauses**.
   - Show that the model detects:
     - `Product Quality`: **Mixed** (camera positive, battery negative)
     - `Customer Service`: **Negative** (*support never answered*)

### Step 5: Viral Potential & Engagement Dynamics (`/viral-potential` & `/engagement-analytics`)
1. Navigate to **Viral Potential**.
2. Explain the experimental heuristic factors behind the score ($0-100$); it is not a trained viral prediction or probability and does not measure engagement growth.
3. In the **Interactive Draft Simulator**:
   - Type a test post with high engagement markers and hashtags.
   - Click **Simulate Viral Potential** to inspect instant score and feedback.
4. Open **Engagement Dynamics** to explain the mathematical formula:
   $$\text{Engagement Score} = \text{Likes} + 2 \times \text{Comments} + 3 \times \text{Shares}$$
   Show the optimal posting hours heatmap.

### Step 6: Crisis Surveillance & Alert Management (`/alerts`)
1. Navigate to **Crisis Alerts**.
2. Explain the threshold: the default alert requires a 35 percentage-point increase across consecutive timestamped seven-day windows and at least 3 items in each window.
3. Review an active potential-issue alert only when real Facebook records meet both sample and rise thresholds:
   - Click **Mark Reviewed** then **Resolve Incident**.
   - Show status updating seamlessly in SQLite.

### Step 7: Machine Learning & Big Data Methodology (`/eval` & `/settings`)
1. Navigate to **Model Benchmark**.
2. Highlight that **no external LLM or paid black-box API is used**:
   - Show the comparative table: Multinomial Naive Bayes vs. Logistic Regression vs. Linear SVM.
   - Display the Confusion Matrix, Class-level Precision, Recall, and F1-Scores.
3. Navigate to **API Status & Engine** (`/settings`):
   - Explain the dual architecture: **Pandas Engine** for rapid local evaluation, swappable with **Apache Spark + HDFS** for enterprise scale.

### Step 8: Executive Dossier & Report Generation (`/reports`)
1. Navigate to **Executive Dossier**.
2. Demonstrate the one-click **Print Dossier / Export PDF** action, formatted with professional print stylesheets suitable for submission.

---

### Focused Facebook analytics regression tests

From `social-media-analytics-backend/` run:

```powershell
.\venv\Scripts\python.exe -m unittest test_feature_analytics -v
```

These tests use in-memory fixtures and do not seed Facebook records. Period comparisons end at the latest stored timestamp, so they describe the contents of stored data rather than asserting that records are current.

## 10. Contributors & License

- **Project Lead**: College Major Project Team
- **Repository**: [Sentiment-Analysis-Using-Big-Data-Analysis](https://github.com/gagansathya86-spec/Sentiment-Analysis-Using-Big-Data-Analysis)
- **Academic Year**: 2026
- **License**: Released for academic and research evaluation purposes.
# Authentication and real HDFS setup

Application login, account creation, protected API behavior, real WebHDFS storage, backfill, Docker/WSL single-node Hadoop setup, and test commands are documented in [AUTH_HDFS_SETUP.md](AUTH_HDFS_SETUP.md). SQLite remains the application and fallback data store; HDFS status is reported as unconfigured until a reachable WebHDFS endpoint is configured.
