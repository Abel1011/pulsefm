#!/usr/bin/env bash
# Pulse — Automated Cloud Run Deployment
# Usage: ./deploy.sh [backend|frontend|all]
# Requires: gcloud CLI authenticated with project access
set -euo pipefail

PROJECT_ID="hackaton-gemini"
REGION="us-central1"
SERVICE_ACCOUNT="vertex-express@${PROJECT_ID}.iam.gserviceaccount.com"

BACKEND_SERVICE="pulse-backend"
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pulse/${BACKEND_SERVICE}"

FRONTEND_SERVICE="pulse-web"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pulse/${FRONTEND_SERVICE}"

TARGET="${1:-all}"

log() { echo "[deploy] $1"; }

deploy_backend() {
  log "Building backend image..."
  gcloud builds submit ./agent-server \
    --project="${PROJECT_ID}" \
    --tag="${BACKEND_IMAGE}:latest" \
    --quiet

  log "Deploying backend to Cloud Run..."
  gcloud run deploy "${BACKEND_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${BACKEND_IMAGE}:latest" \
    --service-account="${SERVICE_ACCOUNT}" \
    --allow-unauthenticated \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=3 \
    --port=3001 \
    --set-env-vars="NODE_ENV=production" \
    --quiet

  BACKEND_URL=$(gcloud run services describe "${BACKEND_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --format="value(status.url)")
  log "Backend deployed: ${BACKEND_URL}"
}

deploy_frontend() {
  # Resolve backend URL for the frontend build
  BACKEND_URL=$(gcloud run services describe "${BACKEND_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --format="value(status.url)" 2>/dev/null || echo "")

  log "Building frontend image..."
  gcloud builds submit ./web \
    --project="${PROJECT_ID}" \
    --tag="${FRONTEND_IMAGE}:latest" \
    --quiet

  log "Deploying frontend to Cloud Run..."
  gcloud run deploy "${FRONTEND_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${FRONTEND_IMAGE}:latest" \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=3 \
    --port=3000 \
    --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_URL=${BACKEND_URL}" \
    --quiet

  FRONTEND_URL=$(gcloud run services describe "${FRONTEND_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --format="value(status.url)")
  log "Frontend deployed: ${FRONTEND_URL}"
}

case "${TARGET}" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)
    deploy_backend
    deploy_frontend
    log "Full deployment complete."
    ;;
  *)
    echo "Usage: ./deploy.sh [backend|frontend|all]"
    exit 1
    ;;
esac
