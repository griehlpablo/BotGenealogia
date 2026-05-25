const fs = require('fs/promises');
const config = require('../src/config');
const { readManualInputs } = require('../src/manualInput');
const { analyzeGenealogyText } = require('../src/ai');
const { writeHtmlReport } = require('../src/report');

async function main() {
  const manualInputs = await readManualInputs();
  if (manualInputs.length === 0) {
    console.warn('[analyze:manual] Nenhum arquivo em data/manual/. Crie arquivos .txt ou .html e rode novamente.');
  }

  const results = [];

  for (const input of manualInputs) {
    console.log(`[analyze:manual] Analisando ${input.sourceFile}`);
    const aiAnalysis = await analyzeGenealogyText({
      searchedPerson: { site: input.site, title: input.title },
      deducedBirthWindow: undefined,
      sourceSite: input.site,
      pageTitle: input.title,
      resultText: input.rawText,
      extractedLinks: input.recordLinks
    });

    results.push({
      search: {
        id: input.id,
        site: input.site,
        title: input.title
      },
      birthWindow: undefined,
      ok: true,
      error: undefined,
      pageState: 'manual_input',
      searchUrl: '',
      rawText: input.rawText,
      recordLinks: input.recordLinks,
      aiAnalysis
    });
  }

  const report = await writeHtmlReport(results);
  console.log(`\n[analyze:manual] Relatorio HTML: ${report.htmlPath}`);
  console.log(`[analyze:manual] Relatorio JSON: ${report.jsonPath}`);
}

main().catch((error) => {
  console.error('[analyze:manual] Erro inesperado:', error);
  process.exitCode = 1;
});
