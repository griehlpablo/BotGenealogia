const { createBrowser, runSearch } = require('../src/scraper');
const { deduceBirthWindow } = require('../src/logic');

async function main() {
  let browser;
  const search = {
    id: 'teste-familysearch',
    site: 'familysearch',
    givenName: 'Maria',
    surname: 'Silva',
    place: 'Brasil',
    birthYear: 1900,
    birthYearTolerance: 10
  };

  try {
    browser = await createBrowser();
    const birthWindow = deduceBirthWindow(search);
    const result = await runSearch(browser, search, birthWindow);
    const recordLinks = result.extracted?.recordLinks || [];

    console.log(`[test:familysearch] ok: ${Boolean(result.ok)}`);
    console.log(`[test:familysearch] pageState: ${result.pageState || ''}`);
    console.log(`[test:familysearch] error: ${result.error || ''}`);
    console.log(`[test:familysearch] searchUrl: ${result.searchUrl || ''}`);
    console.log(`[test:familysearch] links extraidos: ${recordLinks.length}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}

main().catch((error) => {
  console.error(`[test:familysearch] falha fatal: ${error.message}`);
  process.exitCode = 1;
});
