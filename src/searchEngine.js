const config = require('./config');
const { generateQueries } = require('./queryGenerator');
const { searchWeb } = require('./webSearch');
const { classifyUrl } = require('./sourceClassifier');
const { collectPublicPage } = require('./webCollector');
const { scoreWebResult } = require('./evidenceScoring');
const { analyzeGenealogyText } = require('./ai');
const { buildSearchUrl } = require('./scraper');
const { scoreAnalysis } = require('./scoring');
const { deduceBirthWindow } = require('./logic');

async function runSearchPipeline(browser, search) {
  const birthWindow = deduceBirthWindow(search);
  const queries = generateQueries(search).slice(0, config.webSearch.maxQueries || 30);
  const collected = [];
  const manualSources = [];
  const visitedUrls = new Set();
  let firstSearchUrl = '';
  let manualRequired = false;
  let manualSearchUrl = '';

  if (search.site === 'familysearch' && config.familySearchMode === 'manual') {
    manualRequired = true;
    manualSearchUrl = buildSearchUrl(search, birthWindow);
  }

  if (!queries.length) {
    return {
      search,
      birthWindow,
      ok: false,
      pageState: manualRequired ? 'manual_required' : 'no_queries',
      searchUrl: manualSearchUrl || '',
      error: 'Nao foi possivel gerar consultas web para esta pessoa.',
      extracted: { site: 'web', title: '', rawText: '', recordLinks: [] },
      aiAnalysis: null,
      webResults: [],
      manualRequired,
      manualSources
    };
  }

  for (const query of queries) {
    if (collected.length >= config.webSearch.collectMaxPages) break;
    const searchResult = await searchWeb(browser, query);
    if (!firstSearchUrl) firstSearchUrl = searchResult.searchUrl;
    if (!searchResult.ok) continue;

    for (const item of searchResult.results) {
      if (collected.length >= config.webSearch.collectMaxPages) break;
      if (visitedUrls.has(item.url)) continue;
      visitedUrls.add(item.url);

      const sourceType = classifyUrl(item.url, item.snippet, item.title);
      if (sourceType === 'familysearch') {
        manualRequired = true;
        manualSources.push({ url: item.url, title: item.title, sourceType, query: query.query });
        continue;
      }

      const pageData = await collectPublicPage(browser, item, { maxText: 14000 });
      if (!pageData.ok && pageData.pageState === 'manual_required') {
        manualRequired = true;
        manualSources.push({ url: item.url, title: item.title, sourceType, reason: pageData.error });
      }

      const scoredPage = scoreWebResult(pageData, search, birthWindow, sourceType);
      collected.push({ query, item, pageData, sourceType, scoredPage });
    }
  }

  const bestPages = collected
    .sort((a, b) => b.scoredPage.objectiveScore - a.scoredPage.objectiveScore)
    .slice(0, config.webSearch.collectMaxPages || 20);

  const aggregatedText = bestPages.map((entry) => entry.pageData.rawText).join('\n\n').slice(0, 14000);
  const recordLinks = [...new Set(bestPages.flatMap((entry) => entry.pageData.links.map((link) => link.href)))].slice(0, 50);

  const aiAnalysis = await analyzeGenealogyText({
    searchedPerson: search,
    deducedBirthWindow: birthWindow,
    sourceSite: 'web',
    pageTitle: bestPages[0]?.pageData.title || '',
    resultText: aggregatedText,
    extractedLinks: recordLinks
  });

  const scoredAi = scoreAnalysis(aiAnalysis, search, birthWindow);

  return {
    search,
    birthWindow,
    ok: true,
    pageState: manualRequired ? 'manual_required' : 'results_found',
    searchUrl: manualSearchUrl || firstSearchUrl,
    error: manualRequired ? 'Algumas fontes exigem acao manual, mas outros resultados foram coletados.' : undefined,
    rawText: aggregatedText,
    recordLinks,
    aiAnalysis: scoredAi,
    webResults: bestPages.map((entry) => ({
      query: entry.query.query,
      title: entry.item.title,
      url: entry.item.url,
      snippet: entry.item.snippet,
      sourceType: entry.sourceType,
      objectiveScore: entry.scoredPage.objectiveScore,
      confidenceHint: entry.scoredPage.confidenceHint,
      pageState: entry.pageData.pageState,
      error: entry.pageData.error
    })),
    manualRequired,
    manualSources
  };
}

module.exports = {
  runSearchPipeline
};
