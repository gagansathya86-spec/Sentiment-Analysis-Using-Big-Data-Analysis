# Application Login and Hadoop HDFS

This addition keeps the current Facebook Graph ingestion, locally trained TF-IDF + Multinomial Naive Bayes sentiment model, analytics, and SQLite records. Authentication uses SQLite tables added without dropping or rewriting existing tables. HDFS is a separate, real WebHDFS sink; the pandas/Spark processing-engine setting does not itself enable this export.

## What was added

- Login with PBKDF2-HMAC-SHA256 password hashes (310,000 iterations) and HMAC-SHA256 signed bearer tokens. Sessions expire after `AUTH_TOKEN_TTL_MINUTES` and are stored in SQLite so logout revokes them immediately. No registration endpoint is exposed; create accounts through the local CLI.
- All existing FastAPI data/analytics routers require a bearer token. `/health`, `/`, and `/api/auth/login` remain public. Facebook Graph API credentials remain in their existing `FACEBOOK_*` / `META_*` environment variables and are separate from application accounts.
- Facebook post/comment analysis writes directly to real HDFS via WebHDFS when configured, and reports write failures in the response while retaining the data in SQLite. Backfill is repeatable: each record has a stable HDFS file path based on its record id and date. Backfill excludes synthetic demo records by default.
- Raw JSON paths contain captured content, timestamps, and available metrics. Processed paths contain the same record plus its locally generated sentiment label/confidence (and available post aspects). Partitions are `year=YYYY/month=MM/day=DD`.

Example layout:

```text
/social-media-analytics/
  raw/facebook/posts/year=2026/month=10/day=19/<record-id-hash>.json
  raw/facebook/comments/year=2026/month=10/day=19/<record-id-hash>.json
  processed/facebook/posts/year=2026/month=10/day=19/<record-id-hash>.json
  processed/facebook/comments/year=2026/month=10/day=19/<record-id-hash>.json
```

## Environment variables

Set these in `social-media-analytics-backend/.env`:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET_KEY` | Long random signing key. Keep stable between restarts; generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Do not reuse Facebook credentials. If left blank in development, a random process-local key is generated and active sessions will stop working after restart. |
| `AUTH_TOKEN_TTL_MINUTES` | Token lifetime, default `60` (5–1440 minutes). |
| `HDFS_WEBHDFS_URL` | NameNode WebHDFS base URL, including `/webhdfs/v1`, e.g. `http://localhost:9870/webhdfs/v1`. Empty disables HDFS without disabling SQLite. |
| `HDFS_USER` | Optional WebHDFS simple-auth `user.name` for a local development cluster/proxy. Do not use this unauthenticated mode on an exposed/production cluster. |
| `HDFS_ROOT_PATH` | HDFS root folder, default `/social-media-analytics`. |
| `HDFS_TIMEOUT_SECONDS` | HTTP timeout, default `10`. |
| `HDFS_DATANODE_HOST_OVERRIDE` | Optional `host:port` substituted into WebHDFS CREATE redirects when a Docker DataNode advertises an address not reachable by the host process. |

`requests>=2.31,<3` is the only added Python dependency. Authentication uses the Python standard library; no AI model, Meta AI, external AI API, Hadoop Python client, or Spark dependency was added.

## Windows development setup

From PowerShell, start Docker Desktop first if using the Docker route below. The current environment has Docker CLI installed, but its Linux Engine daemon was not running when these changes were checked, and Hadoop/HDFS is not installed locally.

1. Configure a stable random `AUTH_SECRET_KEY` and a real `HDFS_WEBHDFS_URL` in `social-media-analytics-backend/.env`.
2. Start a local Hadoop single-node cluster. Apache documents Linux single-node setup and its Docker setup. On Windows, use the official Hadoop Docker branch from WSL2/Docker Desktop. For the host-run FastAPI process to write through the DataNode redirect, publish its WebHDFS port `9864` and set `HDFS_DATANODE_HOST_OVERRIDE=localhost:9864` (see the Apache compose file and adapt its `datanode` service with `ports: ["9864:9864"]`). The NameNode web port is `9870`.

```powershell
git clone --depth 1 --branch docker-hadoop-3 https://github.com/apache/hadoop.git hadoop-docker
Set-Location hadoop-docker
docker compose build
docker compose up -d
```

The Apache compose setup builds its image from the checked-out source and publishes NameNode port 9870; publish DataNode port 9864 as described above for a host-running application. Wait for HDFS to leave safe mode and confirm `http://localhost:9870` responds. Configure the app endpoint as `http://localhost:9870/webhdfs/v1`. Apache's [single-node Hadoop docs](https://hadoop.apache.org/docs/current/hadoop-project-dist/hadoop-common/SingleCluster.html) describe HDFS initialization and startup; its [Docker branch](https://github.com/apache/hadoop/tree/docker-hadoop-3) has the compatible development compose setup. This dev cluster is not production-secure.

3. Create the first application account (the command prompts for a password twice; minimum 12 characters):

```powershell
Set-Location C:\Users\gagan\Downloads\files\social-media-analytics-backend
.\venv\Scripts\python.exe -m services.auth_service create-user
```

4. Run the app in two PowerShell windows:

```powershell
# Backend
Set-Location C:\Users\gagan\Downloads\files\social-media-analytics-backend
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
# Frontend
Set-Location C:\Users\gagan\Downloads\files\social-media-analytics-frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`, sign in with the application account, and view the dashboard. Create a model if this installation has no registered trained model, then open Facebook, select the Page authorized by the configured Graph API token, and run fetch/analyze. Post and comment analysis uses the existing local classifier. With reachable HDFS, responses include verified raw/processed paths. The dashboard's **Backfill Facebook data** button exports existing non-sample SQLite posts/comments and then shows the processed sentiment/engagement summary read back from HDFS. It also lists the exact HDFS file paths. API equivalents are:

- `GET /api/hdfs/status` — NameNode WebHDFS connectivity check.
- `POST /api/hdfs/export` — idempotent SQLite-to-HDFS backfill; optional `include_sample=true` is for an explicit demo export.
- `GET /api/hdfs/summary` — reads processed JSON files from HDFS and computes post/comment sentiment counts and post engagement totals.

Inspect the written records in the Hadoop NameNode UI or with `hdfs dfs -ls -R /social-media-analytics` inside the Hadoop container. A 200 from the app's write path is not considered sufficient: the service opens each written file and checks the stored record id before it reports `verified: true`.

## Run checks

```powershell
# Backend tests (auth route logic, session expiry/revocation, protected dependency,
# mocked WebHDFS writes/readback/idempotent export/backfill)
Set-Location C:\Users\gagan\Downloads\files\social-media-analytics-backend
.\venv\Scripts\python.exe -m unittest test_auth_hdfs -v

# Existing analytics tests
.\venv\Scripts\python.exe -m unittest test_feature_analytics -v

# Frontend production build
Set-Location ..\social-media-analytics-frontend
npm run build
```

Mocked WebHDFS tests are not real Hadoop tests. A real HDFS connectivity, write/read, or file-listing test requires a running NameNode and reachable DataNode redirect target; these were unavailable in the checked development environment when this change was implemented. The app therefore reports HDFS as unconfigured until `HDFS_WEBHDFS_URL` is set. Facebook ingestion continues to persist in SQLite and explicitly returns HDFS disabled/failure status in that case.

## Operational limits

- Simple `user.name` proxy identity is suitable only for a trusted local development cluster. Apache notes that production Hadoop deployments use Kerberos; configure a trusted authenticated WebHDFS gateway/reverse proxy before exposing HDFS. This service does not implement Kerberos negotiation.
- Per-record JSON files are deliberately easy to verify and deduplicate for this demo, but create small-file overhead at scale. A production data lake should batch into larger files or use a compaction job.
- Existing SQLite posts/comments are preserved and are exported only when backfill is invoked or new Facebook analysis runs. HDFS unavailability is visible to users and does not roll back the SQLite record.
- App authentication applies to current API routers; keep `/health`, `/`, and login reachable for app startup. Deploy over HTTPS in shared environments so bearer tokens are protected in transit.
