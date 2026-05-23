const fs = require('fs/promises');
const path = require('path');
const config = require('./src/config');
const { deduceBirthWindow, formatYearRange } = require('./src/logic');
const { analyzeGenealogyText } = require('./src/ai');
const { analyzeTreePdf } = require('./src/pdfReader');
const { createBrowser, runSearch } = require('./src/scraper');
const { writeHtmlReport } = require('./src/report');
const { normalizeSearch } = require('./src/validators');
const { scoreAnalysis } = require('./src/scoring');

async function readInput() {
  const raw = await fs.readFile(config.inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.searches)) {
    throw new Error(`Arquivo de entrada invalido: ${config.inputPath}`);
  }
  return parsed.searches.map(normalizeSearch);
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
    .map((entry) => path.join(pdfDir, entry.name));

  const searches = [];

  for (const filePath of pdfFiles) {
    try {
      console.log(`\n[pdf] analisando ${filePath}`);
      const pdfSearches = await analyzeTreePdf(filePath);
      searches.push(...pdfSearches.map(normalizeSearch));
      console.log(`[pdf] ${pdfSearches.length} pesquisas sugeridas`);
    } catch (error) {
      console.error(`[pdf] falha ao analisar ${filePath}: ${error.message}`);
    }
  }

  return searches;
}

function summarizeSearch(search, birthWindow) {
  const name = [search.givenName, search.surname].filter(Boolean).join(' ') || search.surname || search.id;
  return `${name} (${search.site || 'familysearch'}) janela=${formatYearRange(birthWindow) || 'sem janela'}`;
}

async function main() {
  const inputSearches = await readInput();
  const pdfSearches = await readPdfSearches();
  const searches = [...inputSearches, ...pdfSearches];
  const browser = await createBrowser();
  const results = [];

  try {
    for (const search of searches) {
      const birthWindow = deduceBirthWindow(search);
      console.log(`\n[busca] ${summarizeSearch(search, birthWindow)}`);

      const scrapeResult = await runSearch(browser, search, birthWindow);
      const aiAnalysis = await analyzeGenealogyText({
        searchedPerson: search,
        deducedBirthWindow: birthWindow,
        sourceSite: scrapeResult.extracted.site,
        pageTitle: scrapeResult.extracted.title,
        resultText: scrapeResult.extracted.rawText,
        extractedLinks: scrapeResult.extracted.recordLinks
      });
      const scoredAiAnalysis = scoreAnalysis(aiAnalysis, search, birthWindow);

      const result = {
        search,
        birthWindow,
        ok: scrapeResult.ok,
        error: scrapeResult.error,
        pageState: scrapeResult.pageState,
        searchUrl: scrapeResult.searchUrl,
        rawText: scrapeResult.extracted.rawText,
        recordLinks: scrapeResult.extracted.recordLinks,
        aiAnalysis: scoredAiAnalysis
      };

      results.push(result);
      console.log('[ia]', JSON.stringify(scoredAiAnalysis, null, 2));
    }
  } finally {
    await browser.close().catch(() => null);
  }

  const report = await writeHtmlReport(results);
  console.log(`\n[relatorio] HTML: ${report.htmlPath}`);
  console.log(`[relatorio] JSON: ${report.jsonPath}`);
}

main().catch((error) => {
  console.error('[fatal]', error);
  process.exitCode = 1;
});
