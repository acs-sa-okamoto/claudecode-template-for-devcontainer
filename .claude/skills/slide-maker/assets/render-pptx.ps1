# render-pptx.ps1 — PPTX の全スライドを PNG に書き出す（PowerPoint COM 使用）
# 使い方: pwsh -File render-pptx.ps1 -Path <file.pptx> -OutDir <dir> [-Width 1600]
# 前提: Windows + PowerPoint がインストールされていること。
# 注意: PowerPoint COM は単一インスタンス。起動済みの PowerPoint があるときは Quit しない（ユーザーの作業を閉じないため）。
#       対象ファイルをユーザーが開いていると競合するため、呼び出し側でコピーを渡すのが安全。
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Width = 1600
)
$ErrorActionPreference = "Stop"
$Path = (Resolve-Path $Path).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

# 既存インスタンスの有無を記録（あれば Quit しない）
$already = Get-Process POWERPNT -ErrorAction SilentlyContinue

$pp = New-Object -ComObject PowerPoint.Application
try {
  # Open(FileName, ReadOnly=-1, Untitled=0, WithWindow=0)
  $pres = $pp.Presentations.Open($Path, -1, 0, 0)
  try {
    $h = [int]($Width * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
    for ($i = 1; $i -le $pres.Slides.Count; $i++) {
      $out = Join-Path $OutDir ("slide-{0:d2}.png" -f $i)
      $pres.Slides.Item($i).Export($out, "PNG", $Width, $h)
      Write-Output $out
    }
  } finally { $pres.Close() }
} finally {
  if (-not $already) { $pp.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp)
}
