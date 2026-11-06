Add-Type -AssemblyName System.Drawing
$taskBuild = Join-Path (Split-Path $PSScriptRoot) 'build'
New-Item -ItemType Directory $taskBuild -Force | Out-Null
$taskImages = @()
foreach ($taskSize in @(16, 24, 32, 48, 64, 128, 256)) {
  $bitmap = [Drawing.Bitmap]::new($taskSize, $taskSize)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform(($taskSize / 256.0), ($taskSize / 256.0))
  $path = [Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc(8,8,64,64,180,90); $path.AddArc(184,8,64,64,270,90)
  $path.AddArc(184,184,64,64,0,90); $path.AddArc(8,184,64,64,90,90); $path.CloseFigure()
  $background = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(40,48,62))
  $light = [Drawing.Pen]::new([Drawing.Color]::FromArgb(223,232,242),22)
  $accent = [Drawing.Pen]::new([Drawing.Color]::FromArgb(156,191,183),22)
  $light.StartCap = $light.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $accent.StartCap = $accent.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $graphics.FillPath($background,$path)
  $graphics.DrawLine($light,66,72,66,184)
  $graphics.DrawLine($light,66,184,108,138)
  $graphics.DrawLine($light,108,138,149,184)
  $graphics.DrawLine($light,149,184,190,72)
  $graphics.DrawLine($accent,68,102,190,102)
  $stream = [IO.MemoryStream]::new(); $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
  $taskImages += ,@($taskSize,$stream.ToArray())
  if ($taskSize -eq 256) { $bitmap.Save((Join-Path $taskBuild 'icon.png'),[Drawing.Imaging.ImageFormat]::Png) }
  $graphics.Dispose(); $bitmap.Dispose(); $path.Dispose(); $background.Dispose(); $light.Dispose(); $accent.Dispose(); $stream.Dispose()
}
$taskOutput = [IO.File]::Create((Join-Path $taskBuild 'icon.ico'))
$taskWriter = [IO.BinaryWriter]::new($taskOutput)
$taskWriter.Write([uint16]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]$taskImages.Count)
$taskOffset = 6 + 16 * $taskImages.Count
foreach ($taskImage in $taskImages) {
  $taskDimension = if ($taskImage[0] -eq 256) { 0 } else { $taskImage[0] }
  $taskWriter.Write([byte]$taskDimension); $taskWriter.Write([byte]$taskDimension)
  $taskWriter.Write([byte]0); $taskWriter.Write([byte]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]32)
  $taskWriter.Write([uint32]$taskImage[1].Length); $taskWriter.Write([uint32]$taskOffset)
  $taskOffset += $taskImage[1].Length
}
foreach ($taskImage in $taskImages) { $taskWriter.Write([byte[]]$taskImage[1]) }
$taskWriter.Dispose(); $taskOutput.Dispose()
Write-Output 'Generated Dayweave application icon.'
