# Stock Analyzer v0.5.0 Build Script
# This script prepares the environment and builds the release version.

$ErrorActionPreference = "Stop"

Write-Host "Starting Build Process for Stock Analyzer v0.5.0..." -ForegroundColor Cyan

# 1. Check Prerequisites
Write-Host "Checking prerequisites..."
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) { Write-Error "npm is not installed." }
if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) { Write-Error "Rust/Cargo is not installed." }

# 2. Setup Python Environment (Extension Runtime)
$pythonDir = "src-tauri\python"
if (-not (Test-Path $pythonDir)) {
    Write-Host "Python runtime directory not found. Creating..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null
    
    # Note: In a real automated pipeline, we would download the python embed zip here.
    # For now, we assume the user/developer puts the necessary python files here 
    # OR we create a placeholder/venv if they have python installed.
    
    if (Get-Command "python" -ErrorAction SilentlyContinue) {
        Write-Host "System Python detected. Attempting to create a local virtual environment for bundling..."
        # python -m venv $pythonDir # This creates a venv, but for bundling we usually want a standalone embed.
        # So we will just warn the user.
        Write-Warning "Please download 'Windows x86-64 embeddable zip file' from python.org and extract it to 'src-tauri/python' for a fully portable distribution."
        Write-Warning "Currently leaving the folder empty/minimal."
    } else {
        Write-Warning "Python not found. The 'py extension' feature may not work without a bundled runtime."
    }
} else {
    Write-Host "Python runtime directory exists." -ForegroundColor Green
}

# 3. Clean Previous Builds
Write-Host "Cleaning previous build artifacts..." -ForegroundColor Yellow
if (Test-Path "src-tauri\target") {
    # Remove-Item -Recurse -Force "src-tauri\target" # Optional: Can be slow, maybe just cargo clean
    cargo clean --manifest-path src-tauri\Cargo.toml
}
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

# 4. Clean Personal Data from Build Context (Safety Check)
# Ensure no local DB is accidentally in resources (though tauri.conf.json controls this)
if (Test-Path "src-tauri\stock_analyzer.db") {
    Write-Host "Found local dev database. Ensuring it is ignored by build..."
    # It is ignored by default unless in 'resources', but we log it.
}

# 5. Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Cyan
npm install
npm run build

# 5.5 Prepare Resources (Copy scripts to src-tauri/scripts to avoid relative path issues)
Write-Host "Preparing resources..." -ForegroundColor Yellow
$srcScripts = "scripts"
$destScripts = "src-tauri\scripts"
if (Test-Path $srcScripts) {
    if (Test-Path $destScripts) {
        Remove-Item -Recurse -Force $destScripts
    }
    Copy-Item -Recurse $srcScripts "src-tauri"
} else {
    Write-Warning "Scripts directory not found at $srcScripts"
}

# 6. Build Backend & Installer
Write-Host "Building Backend and Installer..." -ForegroundColor Cyan
# This will use the updated tauri.conf.json which includes ../scripts/** and python/**
# Use npx tauri build to ensure we use the project-local CLI
npx tauri build

Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "Installer should be in src-tauri\target\release\bundle\nsis"
