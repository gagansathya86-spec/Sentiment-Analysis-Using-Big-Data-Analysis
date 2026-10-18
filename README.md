# Sentiment Analysis Using Big Data Analysis
### Multi-Platform Social Intelligence & Crisis Monitoring Platform
**A College Major Project for Big Data Analytics and Natural Language Processing**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.111-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_%2B_Vite-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Scikit-Learn](https://img.shields.io/badge/ML-TF--IDF_%2B_MultinomialNB-F7931E.svg?logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Meta Graph API](https://img.shields.io/badge/Meta_Graph_API-v21.0-0668E1.svg?logo=meta&logoColor=white)](https://developers.facebook.com/)
[![License](https://img.shields.io/badge/License-Academic_Evaluation-blue.svg)]()

---

## 1. Project Overview & Architecture

This project upgrades an academic big data sentiment analysis application into a unified **Multi-Platform Social Analytics & Intelligence Platform** (**NexusIntel v2.0**). It bridges direct live social ingestion from **Facebook Pages** and **Instagram Professional** accounts via the **Meta Graph API (v21.0)** with distributed data pipelines, sentiment classification, clause-level Aspect-Based Sentiment Analysis (ABSA), viral post potential estimation, and real-time crisis alert surveillance.

### System Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Meta Graph API (v21.0)                 │
                  │   ┌─────────────────────┐    ┌─────────────────────┐   │
                  │   │ Facebook Page Graph │    │ Instagram Business  │   │
                  │   │ (Posts & Comments)  │    │  (Media & Comments) │   │
                  └───┴──────────┬──────────┴────┴──────────┬──────────┴───┘
                                 │                          │
                                 ▼                          ▼
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

## 3. Meta Graph API Integration (Facebook & Instagram)

### Supported Authentication Flows
The platform supports Meta Graph API v21.0:
1. **Facebook Integration**:
   - Queries `/{page_id}/feed?fields=id,message,created_time,shares,reactions.summary(true),comments.summary(true)`.
   - Fetches post comments via `/{post_id}/comments`.
   - Runs text through the sentiment pipeline and normalizes engagement.
2. **Instagram Integration (Professional Account via Facebook Page)**:
   - Queries connected Facebook Pages: `/me/accounts?fields=id,name,access_token,instagram_business_account`.
   - Resolves the linked Instagram Business/Creator Account ID.
   - Fetches media via `/{ig_user_id}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count`.
   - Fetches comment threads via `/{ig_media_id}/comments?fields=id,text,timestamp,username,like_count`.

### Required Meta Developer Permissions
To connect live Meta accounts, your Meta Developer App requires:
| Permission Name | Purpose |
| :--- | :--- |
| `pages_show_list` | Discover pages managed by the user |
| `pages_read_engagement` | Retrieve Facebook post likes, shares, and engagement |
| `pages_manage_posts` / `pages_read_user_content` | Retrieve post and comment text |
| `instagram_basic` | Read Instagram Professional profile info and media list |
| `instagram_manage_comments` | Retrieve media comments for NLP sentiment analysis |

> [!IMPORTANT]
> **Graceful Offline & Evaluation Fallback**: If a live Meta token is expired, short-lived, or lacks enterprise permissions, the application does not crash. It provides explicit diagnostic messages and automatically serves verified multi-platform demonstration records (`is_sample=1`), allowing examiners to evaluate every analytics tab, chart, and feature offline.

---

## 4. Advanced Analytics Features

### A. Aspect-Based Sentiment Analysis (ABSA)
Extracts fine-grained opinion polarity across 7 commercial dimensions:
- `Product Quality`
- `Price & Value`
- `Customer Service`
- `Delivery & Logistics`
- `Usability & UI`
- `Reliability & Bugs`
- `General Feedback`

Uses clause-level segmentation (splitting sentences at contrastive conjunctions like *but, however, although, yet*) to isolate conflicting sentiments within single reviews (e.g., *"The phone screen is gorgeous but delivery was 2 weeks late"*).

### B. Engagement Analytics
Calculates cross-platform interaction dynamics using the standardized social formula:
$$\text{Engagement Score} = \text{Likes} + (2 \times \text{Comments}) + (3 \times \text{Shares})$$
- Explores engagement vs. sentiment correlation.
- Computes optimal posting hours and peak engagement days.
- Separates descriptive statistics from predictive modeling.

### C. Viral Post Potential Estimation
A transparent, heuristic multi-factor scoring model ($0 - 100$) evaluating:
1. **Early Velocity Factor** (Comment-to-Like acceleration ratio, max 30 pts)
2. **Viral Sentiment Magnetism** (Strong polarities outdrive neutral text, max 20 pts)
3. **Copywriting Format & Length** (Optimal text length 100-350 chars, max 15 pts)
4. **Hashtag Virality Ratio** (2-4 targeted hashtags, max 15 pts)
5. **Historical Engagement Performance** (Comparison against platform averages, max 20 pts)

Includes an interactive **Viral Simulator** where marketing drafts can be tested before posting.

### D. Negative Sentiment Spikes & Crisis Alerts
Real-time surveillance monitoring against negative sentiment thresholds:
- Triggers when negative sentiment ratio exceeds configured baseline (default: 40%).
- Isolates affected platform, time window, and driver keywords.
- Workflow management: Mark alerts as **Active**, **Under Review**, or **Resolved**.

### E. Trend & Keyword Discovery
- N-gram term extraction with stopword removal.
- Distinctive term mining comparing Facebook vs. Instagram discourse.
- Live hashtag frequency and trend acceleration velocity.

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

# Instagram Graph API Configuration
INSTAGRAM_ACCESS_TOKEN=your_instagram_user_access_token_here
INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id_here

# Crisis Alert Threshold (percentage of negative posts to trigger alarm)
ALERT_NEGATIVE_THRESHOLD=40.0
```

> [!CAUTION]
> Private access tokens and secrets must never be committed to Git. `.env` is explicitly included in `.gitignore`.

---

## 8. REST API Endpoints Directory (59 Endpoints)

### Unified Multi-Platform Analytics (`/api/unified`)
- `GET /api/unified/status` - Aggregated status of Facebook and Instagram connections.
- `GET /api/unified/metrics` - Total posts, engagement score, sentiment distribution across platforms.
- `GET /api/unified/feed` - Filterable multi-platform feed with pagination and keyword search.
- `GET /api/unified/charts` - Donut, trend timeline, and platform comparison datasets.
- `POST /api/unified/seed-sample` - Re-seed verified multi-platform demonstration data.
- `GET /api/unified/export` - Export unified social data to CSV.

### Instagram Graph API (`/instagram`)
- `GET /instagram/status` - Verify Instagram Professional account connectivity and permissions.
- `GET /instagram/media` - Fetch Instagram media items (caption, timestamp, likes, comments).
- `POST /instagram/analyze` - Run TF-IDF + Naive Bayes sentiment analysis on Instagram captions.
- `GET /instagram/media/{media_id}/comments` - Fetch comments for an Instagram post.
- `POST /instagram/media/{media_id}/comments/analyze` - Run sentiment analysis on post comments.
- `POST /instagram/import-dataset` - Ingest Instagram posts into backend dataset pipeline.

### Facebook Graph API (`/facebook`)
- `GET /facebook/status` - Verify Facebook Page token and account connectivity.
- `GET /facebook/posts` - Fetch Facebook posts and engagement statistics.
- `POST /facebook/analyze` - Run sentiment analysis on Facebook posts.
- `GET /facebook/posts/{post_id}/comments` - Retrieve Facebook comments.
- `POST /facebook/posts/{post_id}/comments/analyze` - Run sentiment analysis on comments.
- `POST /facebook/import-dataset` - Import Facebook feed into dataset pipeline.

### Aspect-Based Sentiment Analysis (`/api/aspects`)
- `GET /api/aspects/summary` - Aggregated polarity scores and counts for 7 commercial dimensions.
- `GET /api/aspects/config` - Get active commercial aspect definitions.
- `POST /api/aspects/config` - Update or customize commercial aspect keywords.
- `POST /api/aspects/analyze-text` - Live sandbox: test arbitrary text for clause-level aspects.

### Engagement Analytics (`/api/engagement-stats`)
- `GET /api/engagement-stats/summary` - Aggregate likes, comments, shares, and engagement rates.
- `GET /api/engagement-stats/by-platform` - Compare Facebook vs Instagram engagement dynamics.
- `GET /api/engagement-stats/top-posts` - Ranked list of highest-performing content.
- `GET /api/engagement-stats/sentiment-correlation` - Interaction distribution across sentiment classes.
- `GET /api/engagement-stats/best-posting-times` - Heatmap analysis of high-engagement time windows.

### Viral Post Potential (`/api/viral`)
- `GET /api/viral/ranked` - Posts ranked by viral potential score (0-100).
- `GET /api/viral/factors/{post_id}` - Factor-by-factor breakdown of a post's viral score.
- `POST /api/viral/simulate` - Live simulator: score marketing copy before publication.

### Crisis Alerts & Incident Surveillance (`/api/alerts`)
- `GET /api/alerts/list` - Incident surveillance feed (active, reviewed, resolved).
- `GET /api/alerts/stats` - Crisis monitoring statistics and negative sentiment ratios.
- `POST /api/alerts/{alert_id}/status` - Update alert status (`reviewed` or `resolved`).
- `GET /api/alerts/threshold` - Fetch active spike threshold.
- `POST /api/alerts/threshold` - Update active spike threshold.

### Trend & Keyword Discovery (`/api/trends-discovery`)
- `GET /api/trends-discovery/keywords` - Top frequent keywords with sentiment associations.
- `GET /api/trends-discovery/hashtags` - Top hashtags across Instagram and Facebook.
- `GET /api/trends-discovery/emerging` - Emerging terms experiencing growth velocity.
- `GET /api/trends-discovery/platform-comparison` - Distinctive terms per platform.

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
2. Explain the **Multi-Platform Analytics** design:
   - Highlight the total items ingested across platforms.
   - Point to the **Social Channel Status** cards showing Facebook Page & Instagram Business operational states.
   - Showcase the **Overall Sentiment Share** (Donut chart) and **Platform Comparison Benchmark** (Positive vs Negative ratio).

### Step 2: Unified Cross-Platform Analytics (`/unified`)
1. Navigate to **Unified Analytics** in the sidebar.
2. Demonstrate the **Platform Filter**:
   - Click **Facebook**: Cards, charts, and table filter down immediately to Facebook records.
   - Click **Instagram**: Instant update to Instagram media and captions.
   - Click **All Platforms**: View normalized cross-platform view.
3. Demonstrate the **Export CSV** button: Downloads normalized records.

### Step 3: Instagram Business Intelligence (`/instagram`)
1. Navigate to **Instagram Business** in the sidebar.
2. Explain the Meta Graph API v21.0 authentication flow (Professional Account linked to Facebook Page).
3. Click **Check Status** to inspect token validity, required permissions (`instagram_basic`, `instagram_manage_comments`), and account ID.
4. Click **Inspect Comments** on any post to demonstrate comment-level sentiment analysis.

### Step 4: Aspect-Based Sentiment Analysis (ABSA) (`/aspects`)
1. Navigate to **Aspect-Based ABSA** in the sidebar.
2. Explain how ABSA overcomes traditional document-level sentiment:
   - Review the 7 commercial dimensions (*Product Quality, Customer Service, Delivery, etc.*).
   - Show how the system captures positive and negative quotes under each dimension.
3. In the **Live Clause-Level Aspect Analyzer**:
   - Enter: `"The smartphone camera is unbelievable, but the battery life is terrible and customer support never answered."`
   - Click **Analyze Aspect Clauses**.
   - Show that the model detects:
     - `Product Quality`: **Positive** (*camera is unbelievable*)
     - `Reliability / Battery`: **Negative** (*battery life is terrible*)
     - `Customer Service`: **Negative** (*support never answered*)

### Step 5: Viral Potential & Engagement Dynamics (`/viral-potential` & `/engagement-analytics`)
1. Navigate to **Viral Potential**.
2. Explain the 5 transparent heuristic factors that drive the score ($0-100$).
3. In the **Interactive Draft Simulator**:
   - Type a test post with high engagement markers and hashtags.
   - Click **Simulate Viral Potential** to inspect instant score and feedback.
4. Open **Engagement Dynamics** to explain the mathematical formula:
   $$\text{Engagement Score} = \text{Likes} + 2 \times \text{Comments} + 3 \times \text{Shares}$$
   Show the optimal posting hours heatmap.

### Step 6: Crisis Surveillance & Alert Management (`/alerts`)
1. Navigate to **Crisis Alerts**.
2. Explain the real-time threshold monitoring (e.g., alert triggers when negative sentiment > 40%).
3. Show an active crisis incident:
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

## 10. Contributors & License

- **Project Lead**: College Major Project Team
- **Repository**: [Sentiment-Analysis-Using-Big-Data-Analysis](https://github.com/gagansathya86-spec/Sentiment-Analysis-Using-Big-Data-Analysis)
- **Academic Year**: 2026
- **License**: Released for academic and research evaluation purposes.
