Add-Type -AssemblyName System.Drawing

$iconPath = "app-icon.png"
if (-not (Test-Path $iconPath)) {
    $bitmap = New-Object System.Drawing.Bitmap(1024, 1024)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::FromArgb(44, 62, 80))
    $font = New-Object System.Drawing.Font("Arial", 200, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.DrawString("SA", $font, $brush, 300, 350)
    $bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "Created app-icon.png"
}
