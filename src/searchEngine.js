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
  const diagnostics = {
    queriesGenerated: queries.length,
    queriesTried: [],
    searchesTried: [],
    searchResultsFound: 0,
    urlsVisited: 0,
    pagesCollected: 0,
    pagesSkipped: 0,
    captchaDetected: false,
    providerCooldown: null,
    searchErrors: [],
    collectErrors: []
  };
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
      manualSources,
      diagnostics
    };
  }

  for (const query of queries) {
    if (collected.length >= config.webSearch.collectMaxPages) break;
    console.log(`[searchEngine] Query: ${query.query}`);
    diagnostics.queriesTried.push(query.query);
    const searchResult = await searchWeb(browser, query);
    if (!firstSearchUrl) firstSearchUrl = searchResult.searchUrl;
    const attempts = searchResult.attempts?.length ? searchResult.attempts : [{
      provider: searchResult.provider,
      query: query.query,
      searchUrl: searchResult.searchUrl,
      ok: searchResult.ok,
      pageState: searchResult.pageState,
      error: searchResult.error,
      resultsCount: searchResult.results?.length || 0
    }];

    diagnostics.searchesTried.push(...attempts);
    for (const attempt of attempts) {
      console.log(`[searchEngine] Provider ${attempt.provider} retornou ${attempt.resultsCount || 0} resultados para: ${query.query}`);
      if (attempt.ok === false) {
        diagnostics.searchErrors.push({
          query: query.query,
          provider: attempt.provider,
          searchUrl: attempt.searchUrl,
          pageState: attempt.pageState,
          error: attempt.error,
          captchaDetected: Boolean(attempt.captchaDetected),
          providerCooldown: attempt.providerCooldown
        });
      }
      if (attempt.captchaDetected) {
        diagnostics.captchaDetected = true;
        diagnostics.providerCooldown = attempt.providerCooldown || diagnostics.providerCooldown;
      }
      if (attempt.providerCooldown) {
        diagnostics.providerCooldown = attempt.providerCooldown;
      }
    }

    if (searchResult.captchaDetected) {
      diagnostics.captchaDetected = true;
      diagnostics.providerCooldown = searchResult.providerCooldown || diagnostics.providerCooldown;
      break;
    }

    if (searchResult.pageState === 'provider_cooldown') {
      diagnostics.providerCooldown = searchResult.providerCooldown || diagnostics.providerCooldown;
      break;
    }

    if (!searchResult.ok) {
      continue;
    }

    diagnostics.searchResultsFound += searchResult.results.length;

    for (const item of searchResult.results) {
      if (collected.length >= config.webSearch.collectMaxPages) break;
      if (visitedUrls.has(item.url)) continue;
      visitedUrls.add(item.url);
      diagnostics.urlsVisited += 1;

      const sourceType = classifyUrl(item.url, item.snippet, item.title);
      if (sourceType === 'familysearch') {
        manualRequired = true;
        manualSources.push({ url: item.url, title: item.title, sourceType, query: query.query });
        diagnostics.pagesSkipped += 1;
        continue;
      }

      console.log(`[webCollector] Coletando: ${item.url}`);
      const pageData = await collectPublicPage(browser, item, { maxText: 14000 });
      if (pageData.ok && pageData.rawText.trim()) {
        console.log(`[webCollector] OK: ${pageData.rawText.length} chars`);
      } else {
        console.warn(`[webCollector] Falhou: ${pageData.pageState}${pageData.error ? `/${pageData.error}` : ''}`);
      }

      if (!pageData.ok && pageData.pageState === 'manual_required') {
        manualRequired = true;
        manualSources.push({ url: item.url, title: item.title, sourceType, reason: pageData.error });
      }

      if (!pageData.ok || !pageData.rawText.trim()) {
        diagnostics.pagesSkipped += 1;
        diagnostics.collectErrors.push({
          url: item.url,
          title: item.title,
          sourceType,
          pageState: pageData.pageState,
          error: pageData.error || 'Coletor retornou texto vazio.'
        });
        continue;
      }

      const scoredPage = scoreWebResult(pageData, search, birthWindow, sourceType);
      collected.push({ query, item, pageData, sourceType, scoredPage });
      diagnostics.pagesCollected += 1;
    }
  }

  const bestPages = collected
    .sort((a, b) => b.scoredPage.objectiveScore - a.scoredPage.objectiveScore)
    .slice(0, config.webSearch.collectMaxPages || 20);

  const aggregatedText = bestPages.map((entry) => entry.pageData.rawText).join('\n\n').slice(0, 14000);
  const recordLinks = [...new Set(bestPages.flatMap((entry) => entry.pageData.links.map((link) => link.href)))].slice(0, 50);

  const webResults = bestPages.map((entry) => ({
    query: entry.query.query,
    title: entry.item.title,
    url: entry.item.url,
    snippet: entry.item.snippet,
    sourceType: entry.sourceType,
    objectiveScore: entry.scoredPage.objectiveScore,
    confidenceHint: entry.scoredPage.confidenceHint,
    pageState: entry.pageData.pageState,
    error: entry.pageData.error
  }));

  if (!aggregatedText.trim()) {
    let error = 'Nenhuma pagina publica relevante foi coletada para analise.';
    if (diagnostics.captchaDetected) {
      error = `Captcha detectado no provedor ${diagnostics.providerCooldown?.provider || diagnostics.searchErrors.find((item) => item.captchaDetected)?.provider || 'web'}. A execucao foi interrompida para evitar insistencia.`;
    } else if (diagnostics.providerCooldown) {
      error = `Provedor ${diagnostics.providerCooldown.provider || 'web'} em cooldown ate ${diagnostics.providerCooldown.until}. Nenhuma busca foi executada neste provedor.`;
    } else if (manualRequired && bestPages.length === 0) {
      error = 'FamilySearch exige acao manual e nenhuma pagina publica foi coletada na web.';
    } else if (manualRequired && bestPages.length > 0) {
      error = 'Algumas fontes exigem acao manual, mas resultados web publicos foram coletados.';
    }

    return {
      search,
      birthWindow,
      ok: false,
      pageState: diagnostics.captchaDetected
        ? 'blocked_or_captcha'
        : (diagnostics.providerCooldown ? 'provider_cooldown' : (manualRequired ? 'manual_required_no_web_results' : 'no_collected_text')),
      searchUrl: manualSearchUrl || firstSearchUrl,
      error,
      rawText: '',
      recordLinks: [],
      aiAnalysis: null,
      webResults,
      manualRequired,
      manualSources,
      captchaDetected: diagnostics.captchaDetected,
      providerCooldown: diagnostics.providerCooldown,
      diagnostics
    };
  }

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
    error: manualRequired
      ? 'Algumas fontes exigem acao manual, mas resultados web publicos foram coletados.'
      : undefined,
    rawText: aggregatedText,
    recordLinks,
    aiAnalysis: scoredAi,
    webResults,
    manualRequired,
    manualSources,
    captchaDetected: diagnostics.captchaDetected,
    providerCooldown: diagnostics.providerCooldown,
    diagnostics
  };
}

module.exports = {
  runSearchPipeline
};
