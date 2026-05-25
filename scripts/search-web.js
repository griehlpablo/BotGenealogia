const fs = require('fs/promises');
const path = require('path');
const config = require('../src/config');
const { normalizeSearch } = require('../src/validators');
const { analyzeTreePdf } = require('../src/pdfReader');
const { createBrowser } = require('../src/scraper');
const { runSearchPipeline } = require('../src/searchEngine');
const { writeHtmlReport } = require('../src/report');
const { getNextSearchesForRun, updatePersonProgress } = require('../src/progressStore');

function parseSourceArg() {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--source='));
  const value = arg ? arg.split('=')[1]?.toLowerCase() : 'input';
  return ['input', 'pdf', 'all'].includes(value) ? value : 'input';
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function didRunWebSearch(result) {
  return (result.diagnostics?.queriesTried || []).length > 0
    || (result.diagnostics?.searchResultsFound || 0) > 0
    || (result.diagnostics?.urlsVisited || 0) > 0;
}

async function readInputSearches() {
  try {
    const raw = await fs.readFile(path.join(config.rootDir, 'data', 'input.json'), 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.searches)) return [];
    return parsed.searches.map(normalizeSearch);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[search:web] data/input.json nao encontrado. Usando searches: [].');
      return [];
    }
    console.warn(`[search:web] Falha ao ler data/input.json: ${error.message}. Usando searches: []`);
    return [];
  }
}

async function readPdfSearches() {
  const pdfDir = path.join(config.rootDir, 'data', 'pdfs');
  let entries;

  try {
    entries = await fs.readdir(pdfDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const pdfFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name);

  const results = [];
  for (const fileName of pdfFiles) {
    const filePath = path.join(pdfDir, fileName);
    try {
      console.log(`[search:web] Analisando PDF: ${fileName}`);
      const searches = await analyzeTreePdf(filePath);
      results.push(...searches.map(normalizeSearch));
    } catch (error) {
      console.warn(`[search:web] Falha ao analisar PDF ${fileName}: ${error.message}`);
    }
  }

  return results;
}

async function main() {
  const source = parseSourceArg();
  console.log(`[search:web] Fonte: ${source}`);

  const inputSearches = (source === 'input' || source === 'all') ? await readInputSearches() : [];
  const pdfSearches = (source === 'pdf' || source === 'all') ? await readPdfSearches() : [];
  const searches = [...inputSearches, ...pdfSearches];
  const continueOnSkip = hasFlag('--continue-on-skip');
  const cloudSafe = hasFlag('--cloud-safe');

  if (searches.length === 0) {
    console.warn('[search:web] Nenhuma busca encontrada em input.json ou pdfs.');
    return;
  }

  const queue = await getNextSearchesForRun(searches, source, {
    maxPeople: config.webSearch.maxPeoplePerRun,
    maxAttempts: config.webSearch.maxAttemptsPerRun,
    continueOnSkip,
    now: new Date()
  });

  if (queue.message) console.warn(`[search:web] ${queue.message}`);
  if (queue.searches.length === 0) return;

  console.log(`[search:web] Fila: ate ${config.webSearch.maxPeoplePerRun} pessoas no relatorio, ${config.webSearch.maxAttemptsPerRun} tentativas, ${config.webSearch.maxSuccessfulSearchesPerRun} buscas reais.`);
  if (cloudSafe) console.log('[search:web] Modo cloud-safe ativo.');

  const browser = await createBrowser();
  const results = [];
  let attempts = 0;
  let successfulSearches = 0;

  try {
    for (const item of queue.searches) {
      if (results.length >= config.webSearch.maxPeoplePerRun) break;
      if (attempts >= config.webSearch.maxAttemptsPerRun) break;
      if (successfulSearches >= config.webSearch.maxSuccessfulSearchesPerRun) break;

      attempts += 1;
      const search = item.search;
      console.log(`\n[search:web] Executando busca: ${search.givenName || ''} ${search.surname || ''}`);
      const result = await runSearchPipeline(browser, search, searches);
      result.queue = {
        key: item.key,
        source,
        attemptNumber: attempts,
        continueOnSkip,
        cloudSafe
      };
      results.push(result);
      if (didRunWebSearch(result)) successfulSearches += 1;

      result.progress = await updatePersonProgress({ search, source, result, status: result.status });
      console.log(`[search:web] Status: ${result.status}`);

      if (result.shouldStopRun || (config.webSearch.stopOnCaptcha && result.diagnostics?.captchaDetected)) {
        console.warn('[search:web] Captcha detectado. Encerrando rodada para evitar insistencia.');
        break;
      }
      if (config.webSearch.stopOnCaptcha && result.diagnostics?.providerCooldown) {
        console.warn('[search:web] Provedor em cooldown. Encerrando rodada para evitar insistencia.');
        break;
      }
      if (!continueOnSkip && ['weak_context', 'manual_required', 'no_results', 'skipped_generic'].includes(result.status)) {
        console.warn('[search:web] Resultado pulavel encontrado. Use --continue-on-skip para seguir automaticamente.');
        break;
      }
    }
  } finally {
    await browser.close().catch(() => null);
  }

  const report = await writeHtmlReport(results, {
    queueSkipped: queue.skipped,
    queueSummary: {
      attempts,
      peopleProcessed: results.length,
      successfulSearches,
      continueOnSkip,
      cloudSafe
    }
  });
  console.log(`\n[search:web] Relatorio HTML: ${report.htmlPath}`);
  console.log(`[search:web] Relatorio JSON: ${report.jsonPath}`);
}

main().catch((error) => {
  console.error('[search:web] Erro inesperado:', error);
  process.exitCode = 1;
});
