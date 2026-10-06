param(
    [switch]$DeployWorker = $true,
    [switch]$DeployFrontend = $true,
    [switch]$DeployReact = $false
)

Write-Host "Starting BinaryWebEngine Deployment..." -ForegroundColor Cyan

# Deploy Cloudflare Worker API
if ($DeployWorker) {
    Write-Host "`n[1/3] Deploying Cloudflare Worker API..." -ForegroundColor Yellow
    Set-Location -Path "worker"
    npx wrangler deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy Cloudflare Worker." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Set-Location -Path ".."
    Write-Host "Cloudflare Worker API deployed successfully." -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping Cloudflare Worker API deployment." -ForegroundColor DarkGray
}

# Deploy Vanilla Frontend
if ($DeployFrontend) {
    Write-Host "`n[2/3] Deploying Vanilla Frontend to Firebase Hosting..." -ForegroundColor Yellow
    Set-Location -Path "frontend"
    npx firebase deploy --only hosting
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy Vanilla Frontend." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Set-Location -Path ".."
    Write-Host "Vanilla Frontend deployed successfully." -ForegroundColor Green
} else {
    Write-Host "`n[2/3] Skipping Vanilla Frontend deployment." -ForegroundColor DarkGray
}

# Deploy React Frontend
if ($DeployReact) {
    Write-Host "`n[3/3] Deploying React Frontend to Firebase Hosting..." -ForegroundColor Yellow
    Set-Location -Path "frontend-react"
    
    Write-Host "Building React app..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to build React Frontend." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    
    npx firebase deploy --only hosting
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to deploy React Frontend." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Set-Location -Path ".."
    Write-Host "React Frontend deployed successfully." -ForegroundColor Green
} else {
    Write-Host "`n[3/3] Skipping React Frontend deployment (use -DeployReact to include)." -ForegroundColor DarkGray
}

Write-Host "`nDeployment process completed!" -ForegroundColor Cyan
