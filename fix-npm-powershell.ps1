# Fix npm PowerShell execution policy issue
# Run this script as Administrator for permanent fix, or without admin for current user only

Write-Host "Current Execution Policy:" -ForegroundColor Yellow
Get-ExecutionPolicy -List

Write-Host "`nSetting Execution Policy to RemoteSigned (CurrentUser scope)..." -ForegroundColor Cyan
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

Write-Host "`nNew Execution Policy:" -ForegroundColor Green
Get-ExecutionPolicy -List

Write-Host "`nTesting npm command..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "npm is working! Version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "npm test failed. You may need to restart your terminal." -ForegroundColor Yellow
}

Write-Host "`nYou can now use npm commands in PowerShell!" -ForegroundColor Green
