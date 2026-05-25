const { createBrowser } = require('../src/scraper');
const { collectPublicPage } = require('../src/webCollector');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: node scripts/test-web-collector.js "https://alguma-url"');
    process.exitCode = 1;
    return;
  }

  let browser;

  try {
    browser = await createBrowser();
    const result = await collectPublicPage(browser, { url, title: '', snippet: '' }, { maxText: 14000 });
    console.log(JSON.stringify({
      ok: result.ok,
      pageState: result.pageState,
      error: result.error,
      title: result.title,
      sourceDomain: result.sourceDomain,
      rawTextLength: result.rawText?.length || 0,
      rawTextPreview: (result.rawText || '').slice(0, 1000)
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      pageState: 'browser_error',
      error: error.message,
      title: '',
      sourceDomain: '',
      rawTextLength: 0,
      rawTextPreview: ''
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

main();
