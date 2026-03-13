# Detect_Na OpenShift Deployment Guide

This guide explains how to deploy the Detect_Na Flask dashboard to OpenShift (HICP).

## Architecture Overview

The system will have **5 pods** running:
1. **ai_agent_core** (Node.js, port 3000) — Main LLM chatbot
2. **api_server** (Python, port 5000) — AI inference models
3. **ollama** (port 11434) — LLM engine
4. **postgresql** (port 5432) — Shared PostgreSQL database
5. **detect-na-dashboard** (Flask, port 5001) — Manufacturing dashboard ← **NEW**

All pods share the same `ai_agent` PostgreSQL database.

---

## Prerequisites

- OpenShift cluster access (HICP)
- GitLab project with CI/CD enabled
- `oc` CLI installed locally
- Admin or project developer roles in OpenShift

---

## Deployment Steps

### Step 1: Create OpenShift Resources

```bash
# Login to OpenShift
oc login --token=YOUR_TOKEN --server=YOUR_SERVER

# Apply all resources (BuildConfig, Deployment, Service, Route)
oc apply -f detect-na-openshift.yaml

# Verify resources created
oc get all -n detect-na
```

### Step 2: Build and Deploy

**Option A: Manual trigger**
```bash
# Start build manually
oc start-build detect-na-dashboard -n detect-na --follow

# Watch pod creation
oc logs -f deployment/detect-na-dashboard -n detect-na
```

**Option B: Automatic (via GitLab CI/CD)**
The `.gitlab-ci.yml` pipeline includes a third build step (`HICP_IMAGE_NAME3`). When you push to `main`:
- Pipeline triggers automatically
- `oc start-build $HICP_IMAGE_NAME3` executes
- Image builds from `Detect_Na/Dockerfile`
- Deployment updates automatically

### Step 3: Get the Route URL

```bash
# Get the public URL
oc get route detect-na-dashboard -n detect-na

# Output example:
# NAME                  HOST/PORT                                            PATH   SERVICES              PORT   TERMINATION
# detect-na-dashboard   detect-na-dashboard-detect-na.apps.xxx.com                detect-na-dashboard   http
```

**Copy this URL** for the next step.

### Step 4: Update Manufacturing Status Button

Edit `ai_agent_core/public/index.html` and replace the `dashboardButton` onclick URL:

```javascript
// Line 60 - Before:
<button id="dashboardButton" onclick="window.open('http://localhost:5001','_blank')">

// After:
<button id="dashboardButton" onclick="window.open('http://detect-na-dashboard-detect-na.apps.YOUR_DOMAIN.com','_blank')">
```

**Where `YOUR_DOMAIN` is from Step 3** (e.g., `apps.oshift.infineon.com`)

### Step 5: Commit and Push

```bash
cd /path/to/repo

git add ai_agent_core/public/index.html
git commit -m "Update Manufacturing Status route to OpenShift Detect_Na endpoint"
git push origin main:recovery-4d0792a0
git push lab main
```

This triggers the pipeline to rebuild all 3 images (`ai_agent_core`, `api_server`, `detect-na-dashboard`).

---

## Environment Variables

The Detect_Na pod uses these env vars (configured in `detect-na-openshift.yaml`):

| Variable | Value | Notes |
|----------|-------|-------|
| `DB_HOST` | `llm-chatbot-with-agent-postgresql` | PostgreSQL hostname (adjust if in different namespace) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `ai_agent` | Database name |
| `DB_USER` | `athip` | Database user |
| `DB_PASSWORD` | `123456` | Database password |
| `TESSERACT_CMD` | `/usr/bin/tesseract` | Tesseract OCR executable path |
| `HOST` | `0.0.0.0` | Flask listen address |
| `PORT` | `5001` | Flask listen port |
| `DEBUG` | `False` | Disable debug mode in production |

**To modify:** Edit the `Deployment` spec in `detect-na-openshift.yaml` and reapply:
```bash
oc apply -f detect-na-openshift.yaml
```

---

## Troubleshooting

### Build fails: "Cannot find Detect_Na/Dockerfile"
- Ensure the Git repo URL and branch are correct in `BuildConfig`
- Verify the Dockerfile exists in the repo

### Pod crashes: "Failed to connect to PostgreSQL"
- Check DB pod is running: `oc get pods -n ai-agent` (or the actual namespace)
- Verify hostname: `oc get svc -n [db-namespace]` should show `llm-chatbot-with-agent-postgresql`
- If in different namespace, update `DB_HOST` in deployment env vars

### Pod crashes: "Tesseract not found"
- Dockerfile installs `tesseract` via `dnf install tesseract`
- Verify in pod: `oc exec -ti pod/detect-na-dashboard-xxx -n detect-na -- which tesseract`

### Route returns 503 Service Unavailable
- Pod may still be starting (liveness check takes ~30s)
- View logs: `oc logs -f deployment/detect-na-dashboard -n detect-na`

### How to redeploy (without code changes)
```bash
# Delete old pod, Deployment will recreate it
oc delete pod -l app=detect-na-dashboard -n detect-na

# Or rollout restart
oc rollout restart deployment/detect-na-dashboard -n detect-na
```

---

## Files Modified

1. **[Detect_Na/Dockerfile](../Detect_Na/Dockerfile)** — UBI9 Python image with Tesseract OCR
2. **[Detect_Na/dashboard/backend/db_helper.py](../Detect_Na/dashboard/backend/db_helper.py)** — DB config uses env vars
3. **[Detect_Na/dashboard/backend/config.py](../Detect_Na/dashboard/backend/config.py)** — HOST/PORT/DEBUG use env vars
4. **[Detect_Na/3_simple.py](../Detect_Na/3_simple.py)** — Tesseract path uses env var
5. **[.gitlab-ci.yml](../.gitlab-ci.yml)** — Added `HICP_IMAGE_NAME3` build step
6. **[detect-na-openshift.yaml](../detect-na-openshift.yaml)** — All OpenShift resources (BuildConfig, Deployment, Service, Route)
7. **[ai_agent_core/public/index.html](../ai_agent_core/public/index.html)** — Updated Manufacturing Status button URL

---

## Next Steps

1. Check GitLab CI/CD Variables — ensure `HICP_IMAGE_NAME3` is set (e.g., `detect-na-dashboard`)
2. Wait for pipeline to complete after git push
3. Test Manufacturing Status button — should open Detect_Na dashboard
4. Monitor pod logs for any startup issues

---

## Questions?

- OpenShift troubleshooting: Check `oc describe pod/detect-na-dashboard-xxx -n detect-na`
- Database issues: Connect to PostgreSQL pod: `oc exec -ti pod/postgresql-xxx -- psql -U athip -d ai_agent`
- Build issues: View full build logs: `oc logs build/detect-na-dashboard-1 -n detect-na`
