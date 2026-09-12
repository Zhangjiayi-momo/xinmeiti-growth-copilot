param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 4173 }
$url = "http://127.0.0.1:$port"

$candidates = @(
  (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
  (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
  'C:\Users\张佳怡\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$node = $candidates | Select-Object -First 1
if (-not $node) {
  throw '未找到 Node.js。请安装 Node.js，或在项目文档中配置正确的运行路径。'
}

$server = Start-Process -FilePath $node -ArgumentList 'apps/web/server.mjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 300
    try {
      $response = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw '服务启动超时，请检查端口是否被占用。' }

  Write-Host "新媒体增长作战台已启动：$url" -ForegroundColor Green
  if (-not $NoBrowser) {
    Start-Process $url
    Write-Host '浏览器已打开。关闭此窗口或按回车即可停止服务。' -ForegroundColor Cyan
    Read-Host | Out-Null
  }
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}