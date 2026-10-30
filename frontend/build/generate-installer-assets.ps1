Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$buildDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logoPath = Join-Path $buildDir '..\assets\icons\logoblanco.png'
$bannerPath = Join-Path $buildDir '..\assets\banner\BannerWps5.png'
if (-not (Test-Path $logoPath)) {
  throw "No se encontro el logo: $logoPath"
}

function New-Bitmap([int]$width, [int]$height) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return @{ Bmp = $bmp; G = $g }
}

function Save-Bmp24($bitmap, [string]$path) {
  $bmp24 = New-Object System.Drawing.Bitmap $bitmap.Width, $bitmap.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp24)
  $g.DrawImage($bitmap, 0, 0, $bitmap.Width, $bitmap.Height)
  $g.Dispose()
  $bmp24.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp24.Dispose()
}

function Add-Glow($g, [int]$x, [int]$y, [int]$w, [int]$h, $color) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($x, $y, $w, $h)
  $pathBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $pathBrush.CenterColor = $color
  $pathBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $color))
  $g.FillPath($pathBrush, $path)
  $pathBrush.Dispose()
  $path.Dispose()
}

$logo = [System.Drawing.Image]::FromFile((Resolve-Path $logoPath))
$banner = $null
if (Test-Path $bannerPath) {
  $banner = [System.Drawing.Image]::FromFile((Resolve-Path $bannerPath))
}

$black = [System.Drawing.Color]::FromArgb(10, 8, 16)
$deepPurple = [System.Drawing.Color]::FromArgb(28, 16, 48)
$magenta = [System.Drawing.Color]::FromArgb(186, 48, 96)
$cyanGlow = [System.Drawing.Color]::FromArgb(70, 80, 200, 220)
$pinkGlow = [System.Drawing.Color]::FromArgb(90, 220, 70, 140)
$accent = [System.Drawing.Color]::FromArgb(225, 6, 0)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255)
$muted = [System.Drawing.Color]::FromArgb(210, 205, 220)

# Sidebar 164x314 (NSIS MUI welcome / finish)
$side = New-Bitmap 164 314
if ($null -ne $banner) {
  $scale = 314.0 / $banner.Height
  $drawW = [int]($banner.Width * $scale)
  $side.G.DrawImage($banner, 0, 0, $drawW, 314)
} else {
  $rect = New-Object System.Drawing.Rectangle 0, 0, 164, 314
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $black, $magenta, 90.0
  $side.G.FillRectangle($brush, $rect)
  $brush.Dispose()
}

Add-Glow $side.G -40 160 220 200 $pinkGlow
Add-Glow $side.G -20 -40 200 160 $cyanGlow

$fadeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  (New-Object System.Drawing.Rectangle 0, 150, 164, 164), `
  ([System.Drawing.Color]::FromArgb(0, 8, 6, 14)), `
  ([System.Drawing.Color]::FromArgb(235, 8, 6, 14)), 90.0
$side.G.FillRectangle($fadeBrush, 0, 150, 164, 164)
$fadeBrush.Dispose()

$accentBrush = New-Object System.Drawing.SolidBrush $accent
$side.G.FillRectangle($accentBrush, 0, 0, 5, 314)

$logoSize = 96
$side.G.DrawImage($logo, [int]((164 - $logoSize) / 2), 36, $logoSize, $logoSize)

$titleFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font 'Segoe UI', 9, ([System.Drawing.FontStyle]::Regular)
$titleBrush = New-Object System.Drawing.SolidBrush $white
$mutedBrush = New-Object System.Drawing.SolidBrush $muted
$title = 'WPS5'
$titleSize = $side.G.MeasureString($title, $titleFont)
$side.G.DrawString($title, $titleFont, $titleBrush, [float]((164 - $titleSize.Width) / 2), 148)
$sub = 'Instalador'
$subSize = $side.G.MeasureString($sub, $subFont)
$side.G.DrawString($sub, $subFont, $mutedBrush, [float]((164 - $subSize.Width) / 2), 188)
$side.G.FillRectangle($accentBrush, 62, 224, 40, 3)

$side.G.Dispose()
$sidePath = Join-Path $buildDir 'installerSidebar.bmp'
$unsidePath = Join-Path $buildDir 'uninstallerSidebar.bmp'
Save-Bmp24 $side.Bmp $sidePath
Save-Bmp24 $side.Bmp $unsidePath
$side.Bmp.Dispose()

# Header 150x57 (NSIS MUI header image, right side)
$header = New-Bitmap 150 57
if ($null -ne $banner) {
  $hScale = 57.0 / $banner.Height
  $hDrawW = [int]($banner.Width * $hScale)
  $header.G.DrawImage($banner, 0, 0, $hDrawW, 57)
} else {
  $hRect = New-Object System.Drawing.Rectangle 0, 0, 150, 57
  $hBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $hRect, $deepPurple, $magenta, 0.0
  $header.G.FillRectangle($hBrush, $hRect)
  $hBrush.Dispose()
}
$header.G.FillRectangle($accentBrush, 0, 0, 150, 3)
$headerLogo = 42
$header.G.DrawImage($logo, 8, [int]((57 - $headerLogo) / 2) + 1, $headerLogo, $headerLogo)
$headerFont = New-Object System.Drawing.Font 'Segoe UI', 14, ([System.Drawing.FontStyle]::Bold)
$header.G.DrawString('WPS5', $headerFont, $titleBrush, 54, 16)
$header.G.Dispose()
$headerPath = Join-Path $buildDir 'installerHeader.bmp'
Save-Bmp24 $header.Bmp $headerPath
$header.Bmp.Dispose()

$logo.Dispose()
if ($null -ne $banner) { $banner.Dispose() }
$titleFont.Dispose()
$subFont.Dispose()
$headerFont.Dispose()
$titleBrush.Dispose()
$mutedBrush.Dispose()
$accentBrush.Dispose()

Write-Host "Generados: $sidePath, $unsidePath, $headerPath"
