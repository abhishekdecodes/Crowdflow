#!/bin/bash
# ═════════════════════════════════════════════════════════════════
#  CrowdFlow — Cloud Run Deployment Script
#  Usage: bash deploy.sh
# ═════════════════════════════════════════════════════════════════

set -e  # Exit on any error

PROJECT_ID="movify-dae45"
REGION="asia-south1"          # Mumbai — closest to Pune
BACKEND_SERVICE="crowdflow-backend"
FRONTEND_SERVICE="crowdflow-frontend"
IMAGE_REGISTRY="gcr.io/${PROJECT_ID}"

# Load env from backend .env
source ./backend/.env 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  CrowdFlow  →  Google Cloud Run Deploy   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Project  : ${PROJECT_ID}"
echo "Region   : ${REGION}"
echo ""

# ── 1. Deploy Backend ─────────────────────────────────────────
echo "▶ [1/3] Deploying backend..."
gcloud run deploy ${BACKEND_SERVICE} \
  --source ./backend \
  --region ${REGION} \
  --platform managed \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},FRONTEND_ORIGIN=https://${FRONTEND_SERVICE}-$(gcloud run services describe ${FRONTEND_SERVICE} --region=${REGION} --format='value(status.url)' 2>/dev/null || echo 'REPLACE_AFTER_FIRST_DEPLOY')" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 60 \
  --quiet

BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} \
  --region=${REGION} \
  --format='value(status.url)')
echo "✅ Backend deployed: ${BACKEND_URL}"

# ── 2. Deploy Frontend ────────────────────────────────────────
echo ""
echo "▶ [2/3] Deploying frontend..."
gcloud run deploy ${FRONTEND_SERVICE} \
  --source . \
  --region ${REGION} \
  --platform managed \
  --build-arg "VITE_MAPS_API_KEY=${VITE_MAPS_API_KEY:-AIzaSyApmiSTVkhLyr-T4vhkjxnM6mR_cyTcyUY}" \
  --build-arg "VITE_BACKEND_URL=${BACKEND_URL}" \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --quiet

FRONTEND_URL=$(gcloud run services describe ${FRONTEND_SERVICE} \
  --region=${REGION} \
  --format='value(status.url)')
echo "✅ Frontend deployed: ${FRONTEND_URL}"

# ── 3. Update Backend CORS with real frontend URL ─────────────
echo ""
echo "▶ [3/3] Updating backend CORS with frontend URL..."
gcloud run services update ${BACKEND_SERVICE} \
  --region ${REGION} \
  --update-env-vars "FRONTEND_ORIGIN=${FRONTEND_URL}" \
  --quiet

echo ""
echo "══════════════════════════════════════════"
echo "🎉 Deployment Complete!"
echo "══════════════════════════════════════════"
echo "  Frontend : ${FRONTEND_URL}"
echo "  Backend  : ${BACKEND_URL}"
echo "══════════════════════════════════════════"
echo ""
