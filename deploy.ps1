$ErrorActionPreference = "Stop"

$PROJECT_ID = "movify-dae45"
$REGION = "asia-south1"
$BACKEND_SERVICE = "crowdflow-backend"
$FRONTEND_SERVICE = "crowdflow-frontend"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗"
Write-Host "║  CrowdFlow -> Google Cloud Run Deploy    ║"
Write-Host "╚══════════════════════════════════════════╝"
Write-Host ""
Write-Host "Project : $PROJECT_ID"
Write-Host "Region  : $REGION"
Write-Host ""

# Load VITE_MAPS_API_KEY from .env locally
$API_KEY = "AIzaSyBold_lXv7eDFEAeZSuXjGa_6ApulM2N3Q"
if (Test-Path -Path "f:\asna\.env") {
    $envContent = Get-Content "f:\asna\.env"
    foreach ($line in $envContent) {
        if ($line -match "^VITE_MAPS_API_KEY=(.*)$") {
            $API_KEY = $matches[1]
        }
    }
}

Write-Host "▶ [1/3] Deploying Backend..."
gcloud run deploy $BACKEND_SERVICE `
  --source .\backend `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 512Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 5 `
  --project $PROJECT_ID `
  --quiet

$BACKEND_URL = (gcloud run services describe $BACKEND_SERVICE --region=$REGION --project=$PROJECT_ID --format='value(status.url)')
Write-Host "✅ Backend deployed: $BACKEND_URL"

Write-Host "`n▶ [2/3] Deploying Frontend..."
gcloud run deploy $FRONTEND_SERVICE `
  --source . `
  --region $REGION `
  --platform managed `
  --update-env-vars "VITE_MAPS_API_KEY=$API_KEY,VITE_BACKEND_URL=$BACKEND_URL" `
  --allow-unauthenticated `
  --memory 256Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 10 `
  --project $PROJECT_ID `
  --quiet

$FRONTEND_URL = (gcloud run services describe $FRONTEND_SERVICE --region=$REGION --project=$PROJECT_ID --format='value(status.url)')
Write-Host "✅ Frontend deployed: $FRONTEND_URL"

Write-Host "`n▶ [3/3] Updating backend CORS with frontend URL..."
gcloud run services update $BACKEND_SERVICE `
  --region $REGION `
  --project $PROJECT_ID `
  --update-env-vars "FRONTEND_ORIGIN=$FRONTEND_URL" `
  --quiet

Write-Host ""
Write-Host "══════════════════════════════════════════"
Write-Host "🎉 Deployment Complete!"
Write-Host "══════════════════════════════════════════"
Write-Host "  Frontend : $FRONTEND_URL"
Write-Host "  Backend  : $BACKEND_URL"
Write-Host "══════════════════════════════════════════"
Write-Host ""
