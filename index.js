const fs = require('fs/promises');
const config = require('./src/config');
const { deduceBirthWindow, formatYearRange } = require('./src/logic');
const { analyzeGenealogyText } = require('./src/ai');
const { createBrowser, runSearch } = require('./src/scraper');
const { writeHtmlReport } = require('./src/report');

async function readInput() {
  const raw = await fs.readFile(config.inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.searches)) {
    throw new Error(`Arquivo de entrada invalido: ${config.inputPath}`);
  }
  return parsed.searches;
}

function summarizeSearch(search, birthWindow) {
  const name = [search.givenName, search.surname].filter(Boolean).join(' ') || search.surname || search.id;
  return `${name} (${search.site || 'familysearch'}) janela=${formatYearRange(birthWindow) || 'sem janela'}`;
}

async function main() {
  const searches = await readInput();
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

      const result = {
        search,
        birthWindow,
        ok: scrapeResult.ok,
        error: scrapeResult.error,
        searchUrl: scrapeResult.searchUrl,
        rawText: scrapeResult.extracted.rawText,
        recordLinks: scrapeResult.extracted.recordLinks,
        aiAnalysis
      };

      results.push(result);
      console.log('[ia]', JSON.stringify(aiAnalysis, null, 2));
    }
  } finally {
    await browser.close().catch(() => null);
  }

  const reportPath = await writeHtmlReport(results);
  console.log(`\n[relatorio] ${reportPath}`);
}

main().catch((error) => {
  console.error('[fatal]', error);
  process.exitCode = 1;
});
