const { createBrowser } = require('../src/scraper');
const { searchWeb } = require('../src/webSearch');

async function main() {
  const query = '"Pedro Tramontini" "Justina Savi"';
  let browser;

  try {
    browser = await createBrowser();
    const result = await searchWeb(browser, { query, purpose: 'diagnostic', priority: 1 });
    console.log(JSON.stringify({
      provider: result.provider,
      query,
      searchUrl: result.searchUrl,
      ok: result.ok,
      pageState: result.pageState,
      error: result.error,
      resultsCount: result.results?.length || 0,
      attempts: result.attempts || [],
      results: (result.results || []).slice(0, 10).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet
      }))
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      provider: null,
      query,
      searchUrl: null,
      ok: false,
      pageState: 'browser_error',
      error: error.message,
      resultsCount: 0,
      results: []
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

main();
