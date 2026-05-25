$env:HEADLESS="true"
$env:FAMILYSEARCH_MODE="manual"

$env:WEB_SEARCH_PROVIDER="duckduckgo"
$env:WEB_SEARCH_LIMIT="5"
$env:WEB_SEARCH_MAX_QUERIES="8"
$env:WEB_COLLECT_MAX_PAGES="10"
$env:WEB_SEARCH_DELAY_MIN_MS="4000"
$env:WEB_SEARCH_DELAY_MAX_MS="9000"
$env:WEB_COLLECT_DELAY_MIN_MS="4000"
$env:WEB_COLLECT_DELAY_MAX_MS="10000"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = ".\output\run-almoco-$timestamp.log"

Write-Host "Iniciando busca web dos PDFs..."
Write-Host "Log: $log"

npm run search:web:pdf *>&1 | Tee-Object -FilePath $log

Write-Host ""
Write-Host "Finalizado. Veja os relatórios mais recentes em output/"
Get-ChildItem .\output\ | Sort-Object LastWriteTime -Descending | Select-Object -First 10