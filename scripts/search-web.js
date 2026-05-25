const fs = require('fs/promises');
const path = require('path');
const config = require('../src/config');
const { normalizeSearch } = require('../src/validators');
const { analyzeTreePdf } = require('../src/pdfReader');
const { createBrowser } = require('../src/scraper');
const { runSearchPipeline } = require('../src/searchEngine');
const { writeHtmlReport } = require('../src/report');

function parseSourceArg() {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--source='));
  const value = arg ? arg.split('=')[1]?.toLowerCase() : 'input';
  return ['input', 'pdf', 'all'].includes(value) ? value : 'input';
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

  if (searches.length === 0) {
    console.warn('[search:web] Nenhuma busca encontrada em input.json ou pdfs.');
    return;
  }

  const browser = await createBrowser();
  const results = [];

  try {
    for (const search of searches) {
      console.log(`\n[search:web] Executando busca: ${search.givenName || ''} ${search.surname || ''}`);
      const result = await runSearchPipeline(browser, search);
      results.push(result);
    }
  } finally {
    await browser.close().catch(() => null);
  }

  const report = await writeHtmlReport(results);
  console.log(`\n[search:web] Relatorio HTML: ${report.htmlPath}`);
  console.log(`[search:web] Relatorio JSON: ${report.jsonPath}`);
}

main().catch((error) => {
  console.error('[search:web] Erro inesperado:', error);
  process.exitCode = 1;
});
