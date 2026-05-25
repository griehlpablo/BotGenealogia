const config = require('./config');
const { generateQueries } = require('./queryGenerator');
const { searchWeb } = require('./webSearch');
const { classifyUrl } = require('./sourceClassifier');
const { collectPublicPage } = require('./webCollector');
const { scoreWebResult } = require('./evidenceScoring');
const { scorePreCollectResult } = require('./preCollectScoring');
const { analyzeGenealogyText } = require('./ai');
const { buildSearchUrl } = require('./scraper');
const { scoreAnalysis } = require('./scoring');
const { deduceBirthWindow } = require('./logic');
const { createResearchPlan } = require('./researchPlanner');
const { enrichWeakPersonWithRelativeResults } = require('./contextEnricher');
const { normalizeResultStatus, queueFlagsForStatus } = require('./resultStatus');

function finalizeResult(result) {
  const status = normalizeResultStatus(result);
  return {
    ...result,
    status,
    ...queueFlagsForStatus(status)
  };
}

async function executeDirectSearch(browser, search, options = {}) {
  const birthWindow = deduceBirthWindow(search);
  const queries = (options.queries || generateQueries(search, options.queryContext || {})).slice(0, config.webSearch.maxQueries || 30);
  const collected = [];
  const webResultRecords = [];
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
    queriesSkipped: 0,
    skippedReasons: [],
    urlsSkippedBeforeCollect: 0,
    excludedDomainsSkipped: 0,
    lowRelevanceSkipped: 0,
    captchaDetected: false,
    providerCooldown: null,
    searchErrors: [],
    collectErrors: [],
    researchPlan: options.researchPlan || null,
    researchStep: options.researchStep || null,
    enrichmentResult: options.enrichmentResult || null
  };
  let firstSearchUrl = '';
  let manualRequired = false;
  let manualSearchUrl = '';

  if (search.site === 'familysearch' && config.familySearchMode === 'manual') {
    manualRequired = true;
    manualSearchUrl = buildSearchUrl(search, birthWindow);
  }

  if (!queries.length) {
    return finalizeResult({
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
    });
  }

  for (const query of queries) {
    if (collected.length >= (options.collectMaxPages || config.webSearch.collectMaxPages)) break;
    if (query.skipWeb) {
      diagnostics.queriesSkipped += 1;
      diagnostics.skippedReasons.push({ type: 'generic_query', query: query.query, reason: query.reason });
      webResultRecords.push({
        query: query.query,
        title: '',
        url: '',
        snippet: '',
        sourceType: 'skipped',
        pageState: 'query_skipped',
        collected: false,
        skipReason: query.reason || 'generic_query'
      });
      console.warn(`[searchEngine] Query pulada: ${query.reason || 'generic_query'}`);
      continue;
    }

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
      if (collected.length >= (options.collectMaxPages || config.webSearch.collectMaxPages)) break;
      if (visitedUrls.has(item.url)) continue;
      visitedUrls.add(item.url);
      diagnostics.urlsVisited += 1;

      const sourceType = classifyUrl(item.url, item.snippet, item.title);
      const sourceDomain = safeHostname(item.url);
      if (sourceType === 'familysearch') {
        manualRequired = true;
        manualSources.push({ url: item.url, title: item.title, sourceType, query: query.query });
        diagnostics.pagesSkipped += 1;
        diagnostics.urlsSkippedBeforeCollect += 1;
        diagnostics.skippedReasons.push({ type: 'manual_required', url: item.url, domain: sourceDomain });
        webResultRecords.push({
          query: query.query,
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          sourceType,
          pageState: 'manual_required',
          collected: false,
          skipReason: 'manual_required'
        });
        continue;
      }

      const excludedDomain = isExcludedDomain(sourceDomain);
      const preCollect = scorePreCollectResult(item, search, birthWindow, sourceType);

      if (excludedDomain || (sourceType === 'encyclopedia' && !config.webSearch.allowEncyclopedia)) {
        diagnostics.pagesSkipped += 1;
        diagnostics.urlsSkippedBeforeCollect += 1;
        diagnostics.excludedDomainsSkipped += 1;
        const skipReason = excludedDomain ? 'excluded_domain' : 'encyclopedia_not_allowed';
        diagnostics.skippedReasons.push({ type: skipReason, url: item.url, domain: sourceDomain });
        webResultRecords.push({
          query: query.query,
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          sourceType,
          preScore: preCollect.preScore,
          preScoreReasons: preCollect.reasons,
          preScorePenalties: preCollect.penalties,
          pageState: 'skipped_before_collect',
          collected: false,
          skipReason
        });
        console.warn(`[searchEngine] Pulando ${item.url}: ${skipReason}`);
        continue;
      }

      if (preCollect.preScore < config.webSearch.preCollectMinScore) {
        diagnostics.pagesSkipped += 1;
        diagnostics.urlsSkippedBeforeCollect += 1;
        diagnostics.lowRelevanceSkipped += 1;
        diagnostics.skippedReasons.push({ type: 'low_precollect_score', url: item.url, preScore: preCollect.preScore, penalties: preCollect.penalties });
        webResultRecords.push({
          query: query.query,
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          sourceType,
          preScore: preCollect.preScore,
          preScoreReasons: preCollect.reasons,
          preScorePenalties: preCollect.penalties,
          pageState: 'skipped_before_collect',
          collected: false,
          skipReason: 'low_precollect_score'
        });
        console.warn(`[searchEngine] Pulando ${item.url}: preScore ${preCollect.preScore} abaixo de ${config.webSearch.preCollectMinScore}`);
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
      collected.push({ query, item, pageData, sourceType, scoredPage, preCollect });
      diagnostics.pagesCollected += 1;
    }
  }

  const bestPages = collected
    .sort((a, b) => b.scoredPage.objectiveScore - a.scoredPage.objectiveScore)
    .slice(0, options.collectMaxPages || config.webSearch.collectMaxPages || 20);

  const aggregatedText = bestPages.map((entry) => entry.pageData.rawText).join('\n\n').slice(0, 14000);
  const recordLinks = [...new Set(bestPages.flatMap((entry) => entry.pageData.links.map((link) => link.href)))]
    .filter((href) => {
      const value = String(href || '').trim();
      return value && value !== '#' && !value.toLowerCase().startsWith('javascript:');
    })
    .slice(0, 50);

  const webResults = bestPages.map((entry) => ({
    query: entry.query.query,
    title: entry.item.title,
    url: entry.item.url,
    snippet: entry.item.snippet,
    sourceType: entry.sourceType,
    objectiveScore: entry.scoredPage.objectiveScore,
    confidenceHint: entry.scoredPage.confidenceHint,
    pageState: entry.pageData.pageState,
    error: entry.pageData.error,
    preScore: entry.preCollect?.preScore,
    preScoreReasons: entry.preCollect?.reasons || [],
    preScorePenalties: entry.preCollect?.penalties || [],
    collected: true,
    skipReason: ''
  }));
  webResultRecords.push(...webResults);

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

    return finalizeResult({
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
      webResults: webResultRecords,
      manualRequired,
      manualSources,
      captchaDetected: diagnostics.captchaDetected,
      providerCooldown: diagnostics.providerCooldown,
      researchPlan: options.researchPlan || null,
      researchStep: options.researchStep || null,
      enrichmentResult: options.enrichmentResult || null,
      diagnostics
    });
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

  return finalizeResult({
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
    webResults: webResultRecords,
    manualRequired,
    manualSources,
    captchaDetected: diagnostics.captchaDetected,
    providerCooldown: diagnostics.providerCooldown,
    researchPlan: options.researchPlan || null,
    researchStep: options.researchStep || null,
    enrichmentResult: options.enrichmentResult || null,
    diagnostics
  });
}

async function runSearchPipeline(browser, search, allSearches = []) {
  const researchPlan = createResearchPlan(search, allSearches);
  const planSummary = summarizePlan(researchPlan);

  if (researchPlan.strategy === 'manual_only') {
    const birthWindow = deduceBirthWindow(search);
    return finalizeResult({
      search,
      birthWindow,
      ok: false,
      pageState: 'no_queries',
      searchUrl: buildSearchUrl(search, birthWindow),
      error: 'Pessoa fraca demais para busca web geral. Busca direta evitada para reduzir falsos positivos.',
      rawText: '',
      recordLinks: [],
      aiAnalysis: null,
      webResults: [],
      manualRequired: true,
      manualSources: [],
      captchaDetected: false,
      providerCooldown: null,
      researchPlan: planSummary,
      diagnostics: {
        researchPlan: planSummary,
        stepsExecuted: [],
        queriesGenerated: 0,
        queriesTried: [],
        queriesSkipped: 0,
        skippedReasons: [{ type: 'manual_only', reason: 'Baixa pesquisabilidade; busca web pulada.' }],
        searchResultsFound: 0,
        urlsVisited: 0,
        pagesCollected: 0,
        pagesSkipped: 0,
        urlsSkippedBeforeCollect: 0,
        excludedDomainsSkipped: 0,
        lowRelevanceSkipped: 0,
        captchaDetected: false,
        providerCooldown: null,
        searchErrors: [],
        collectErrors: []
      }
    });
  }

  if (researchPlan.strategy !== 'search_relatives_first') {
    return executeDirectSearch(browser, search, {
      researchPlan: planSummary,
      researchStep: researchPlan.steps[0] || null
    });
  }

  const stepsExecuted = [];
  const relativeResults = [];
  const relativeSteps = researchPlan.steps
    .filter((step) => step.type === 'search_relative')
    .slice(0, config.webSearch.relativeSearchLimit || 2);

  for (const step of relativeSteps) {
    stepsExecuted.push({ type: step.type, name: [step.search.givenName, step.search.surname].filter(Boolean).join(' '), reason: step.reason });
    const result = await executeDirectSearch(browser, step.search, {
      researchPlan: planSummary,
      researchStep: step,
      collectMaxPages: 1
    });
    if (result.rawText?.trim()) {
      relativeResults.push({ search: step.search, rawText: result.rawText, webResults: result.webResults });
    }
    if (result.diagnostics?.captchaDetected || result.diagnostics?.providerCooldown) {
      result.researchPlan = { ...planSummary, stepsExecuted };
      result.diagnostics.researchPlan = result.researchPlan;
      return result;
    }
  }

  const enrichmentResult = await enrichWeakPersonWithRelativeResults(search, relativeResults);
  const shouldSearchTarget = enrichmentResult.candidateQueries.length > 0 || enrichmentResult.discoveredFacts.length > 0;

  if (!shouldSearchTarget) {
    const birthWindow = deduceBirthWindow(search);
    return finalizeResult({
      search,
      birthWindow,
      ok: false,
      pageState: 'weak_context_manual_required',
      searchUrl: buildSearchUrl(search, birthWindow),
      error: 'Contexto fraco: parentes nao trouxeram evidencias suficientes para buscar a pessoa alvo com seguranca.',
      rawText: '',
      recordLinks: [],
      aiAnalysis: null,
      webResults: [],
      manualRequired: true,
      manualSources: [],
      captchaDetected: false,
      providerCooldown: null,
      researchPlan: { ...planSummary, stepsExecuted },
      enrichmentResult,
      diagnostics: {
        researchPlan: { ...planSummary, stepsExecuted },
        enrichmentResult,
        stepsExecuted,
        queriesGenerated: 0,
        queriesTried: [],
        queriesSkipped: 1,
        skippedReasons: [{
          type: 'weak_context',
          reason: researchPlan.familyContext.relatives.length === 0
            ? 'Sem parentes disponiveis no contexto atual.'
            : 'Busca direta evitada para reduzir falsos positivos.'
        }],
        searchResultsFound: 0,
        urlsVisited: 0,
        pagesCollected: 0,
        pagesSkipped: 0,
        urlsSkippedBeforeCollect: 0,
        excludedDomainsSkipped: 0,
        lowRelevanceSkipped: 0,
        captchaDetected: false,
        providerCooldown: null,
        searchErrors: [],
        collectErrors: []
      }
    });
  }

  const enrichedContext = {
    strategy: 'enriched_target_search',
    relatives: researchPlan.familyContext.relatives,
    candidateSurnames: researchPlan.familyContext.candidateSurnames,
    discoveredFacts: enrichmentResult.discoveredFacts,
    candidateQueries: enrichmentResult.candidateQueries
  };

  const targetStep = researchPlan.steps.find((step) => step.type === 'search_target_enriched') || null;
  stepsExecuted.push({ type: 'search_target_enriched', reason: targetStep?.reason || 'Busca alvo enriquecida.' });
  const targetResult = await executeDirectSearch(browser, enrichmentResult.enrichedSearch, {
    queryContext: enrichedContext,
    researchPlan: { ...planSummary, stepsExecuted },
    researchStep: targetStep,
    enrichmentResult
  });
  targetResult.search = search;
  targetResult.enrichedSearch = enrichmentResult.enrichedSearch;
  targetResult.researchPlan = { ...planSummary, stepsExecuted };
  targetResult.enrichmentResult = enrichmentResult;
  targetResult.diagnostics.researchPlan = targetResult.researchPlan;
  targetResult.diagnostics.enrichmentResult = enrichmentResult;
  return targetResult;
}

function summarizePlan(plan) {
  return {
    targetStrength: plan.targetStrength,
    strategy: plan.strategy,
    relativesConsidered: plan.familyContext.relatives.map((relative) => ({
      type: relative.type,
      name: relative.name,
      confidence: relative.confidence,
      reason: relative.reason
    })),
    extractedNamesFromReason: plan.familyContext.extractedNamesFromReason,
    candidateSurnames: plan.familyContext.candidateSurnames,
    candidatePlaces: plan.familyContext.candidatePlaces,
    candidateYears: plan.familyContext.candidateYears,
    steps: plan.steps.map((step) => ({
      type: step.type,
      name: [step.search?.givenName, step.search?.surname].filter(Boolean).join(' '),
      reason: step.reason,
      priority: step.priority
    }))
  };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

function isExcludedDomain(hostname) {
  if (!hostname) return false;
  return (config.webSearch.excludedDomains || []).some((domain) => {
    const normalized = String(domain || '').toLowerCase().replace(/^www\./, '');
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

module.exports = {
  runSearchPipeline
};
