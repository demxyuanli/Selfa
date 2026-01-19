# Fix PowerShell Execution Policy
# Run this script as Administrator

Write-Host "Current Execution Policy:" -ForegroundColor Yellow
Get-ExecutionPolicy -List

Write-Host "`nSetting Execution Policy to RemoteSigned (CurrentUser scope)..." -ForegroundColor Cyan
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

Write-Host "`nNew Execution Policy:" -ForegroundColor Green
Get-ExecutionPolicy -List

Write-Host "`nYou can now run PowerShell scripts!" -ForegroundColor Green
