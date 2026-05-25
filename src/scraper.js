const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const config = require('./config');
const { loadCookies, saveCookies } = require('./session');
const { extractFamilySearchResults } = require('./siteExtractors/familysearch');
const { extractMyHeritageResults } = require('./siteExtractors/myheritage');
const { extractGoogleResults } = require('./siteExtractors/google');
const { extractBingResults } = require('./siteExtractors/bing');
const { extractDuckDuckGoResults } = require('./siteExtractors/duckduckgo');
const { extractGenericResults } = require('./siteExtractors/generic');

const SITE_CONFIG = {
  familysearch: {
    name: 'FamilySearch',
    baseUrl: 'https://www.familysearch.org',
    loginUrl: 'https://www.familysearch.org/auth/familysearch/login',
    searchUrl: 'https://www.familysearch.org/search/record/results',
    cookieDomainUrl: 'https://www.familysearch.org',
    loginSelectors: {
      email: 'input[name="username"], input[type="email"], #userName',
      password: 'input[name="password"], input[type="password"], #password',
      submit: 'button[type="submit"], input[type="submit"]'
    }
  },
  myheritage: {
    name: 'MyHeritage',
    baseUrl: 'https://www.myheritage.com',
    loginUrl: 'https://www.myheritage.com/login',
    searchUrl: 'https://www.myheritage.com/research',
    cookieDomainUrl: 'https://www.myheritage.com',
    loginSelectors: {
      email: 'input[name="email"], input[type="email"]',
      password: 'input[name="password"], input[type="password"]',
      submit: 'button[type="submit"], input[type="submit"]'
    }
  },
  google: {
    name: 'Google',
    baseUrl: 'https://www.google.com',
    searchUrl: 'https://www.google.com/search'
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanDelay(label = 'pausa') {
  const ms = randomInt(config.browser.minDelayMs, config.browser.maxDelayMs);
  console.log(`[delay] ${label}: ${ms}ms`);
  await sleep(ms);
}

function resolveExecutablePath() {
  if (config.browser.executablePath) return config.browser.executablePath;

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function createBrowser() {
  const executablePath = resolveExecutablePath();
  const launchOptions = {
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
    executablePath,
    defaultViewport: { width: 1366, height: 900 },
    args: [
      '--window-size=1366,900',
      ...config.browser.extraArgs
    ]
  };

  if (config.browser.userDataDir) {
    launchOptions.userDataDir = config.browser.userDataDir;
  }

  return puppeteer.launch(launchOptions);
}

function siteKeyFor(search) {
  const site = (search.site || 'familysearch').toLowerCase();
  if (site === 'web' || site === 'google') return 'google';
  if (site === 'bing') return 'bing';
  if (site === 'duckduckgo') return 'duckduckgo';
  return SITE_CONFIG[site] ? site : 'familysearch';
}

function buildSearchEngineQuery(search) {
  const pieces = [];
  if (search.givenName) pieces.push(search.givenName);
  if (search.surname) pieces.push(search.surname);
  if (search.place) pieces.push(search.place);
  if (search.birthYear) pieces.push(String(search.birthYear));
  return pieces.filter(Boolean).join(' ').trim();
}

function buildFamilySearchUrl(search, birthWindow) {
  const params = new URLSearchParams();
  if (search.givenName) params.set('q.givenName', search.givenName);
  if (search.surname) params.set('q.surname', search.surname);
  if (search.place) params.set('q.birthLikePlace', search.place);
  if (birthWindow) params.set('q.birthLikeDate.from', String(birthWindow.from));
  if (birthWindow) params.set('q.birthLikeDate.to', String(birthWindow.to));
  return `${SITE_CONFIG.familysearch.searchUrl}?${params.toString()}`;
}

function buildBingUrl(search, birthWindow) {
  const query = buildSearchEngineQuery(search);
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
}

function buildDuckDuckGoUrl(search, birthWindow) {
  const query = buildSearchEngineQuery(search);
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function buildMyHeritageUrl(search, birthWindow) {
  const params = new URLSearchParams({
    formId: 'master',
    formMode: '1',
    action: 'query',
    exactSearch: '0',
    useTranslation: '1'
  });

  const fullName = [search.givenName, search.surname].filter(Boolean).join(' ');
  if (fullName) params.set('qname', fullName);
  if (birthWindow) params.set('qbirth', `${birthWindow.from}-${birthWindow.to}`);
  if (search.place) params.set('qevents-place', search.place);
  return `${SITE_CONFIG.myheritage.searchUrl}?${params.toString()}`;
}

function buildGoogleUrl(search, birthWindow) {
  const pieces = [];
  const name = [search.givenName, search.surname].filter(Boolean).join(' ').trim();
  if (name) pieces.push(`"${name}"`);
  if (search.place) pieces.push(`"${search.place}"`);
  pieces.push('(genealogia OR genealogy OR obituario OR "family tree")');

  if (birthWindow?.from && birthWindow?.to) {
    pieces.push(`${birthWindow.from}..${birthWindow.to}`);
  }

  const params = new URLSearchParams({ q: pieces.filter(Boolean).join(' ') });
  return `${SITE_CONFIG.google.searchUrl}?${params.toString()}`;
}

function buildSearchUrl(search, birthWindow) {
  const siteKey = siteKeyFor(search);
  if (siteKey === 'myheritage') return buildMyHeritageUrl(search, birthWindow);
  if (siteKey === 'google') return buildGoogleUrl(search, birthWindow);
  if (siteKey === 'bing') return buildBingUrl(search, birthWindow);
  if (siteKey === 'duckduckgo') return buildDuckDuckGoUrl(search, birthWindow);
  return buildFamilySearchUrl(search, birthWindow);
}

async function clickIfExists(page, selector) {
  try {
    const element = await page.$(selector);
    if (!element) return false;
    await element.click();
    return true;
  } catch (error) {
    console.warn(`[scraper] Clique ignorado (${selector}): ${error.message}`);
    return false;
  }
}

async function typeIfExists(page, selector, value) {
  if (!value) return false;
  try {
    const element = await page.$(selector);
    if (!element) return false;
    await element.click({ clickCount: 3 });
    await element.type(value, { delay: randomInt(40, 140) });
    return true;
  } catch (error) {
    console.warn(`[scraper] Digitacao ignorada (${selector}): ${error.message}`);
    return false;
  }
}

async function gotoWithRetry(page, url, options, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        console.log(`[scraper] Retry de navegacao ${attempt}/${retries}`);
        await humanDelay('antes do retry');
      }
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;
      const retryable = /timeout|navigation|net::/i.test(error.message);
      if (!retryable || attempt === retries) break;
    }
  }
  throw lastError;
}

async function authenticate(page, siteKey) {
  if (siteKey === 'google') return;

  const site = SITE_CONFIG[siteKey];
  const credentials = config.credentials[siteKey] || {};

  await gotoWithRetry(page, site.cookieDomainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }, 1);
  const loaded = await loadCookies(page, config.sessionsDir, siteKey);
  if (loaded > 0) {
    console.log(`[sessao] ${loaded} cookies reaproveitados para ${site.name}.`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await humanDelay('validando sessao');
    return;
  }

  console.log(`[sessao] Sem cookies de ${site.name}. Abrindo login inicial.`);
  await gotoWithRetry(page, site.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }, 1);
  await humanDelay('pagina de login');

  const typedEmail = await typeIfExists(page, site.loginSelectors.email, credentials.email);
  const typedPassword = await typeIfExists(page, site.loginSelectors.password, credentials.password);

  if (typedEmail && typedPassword) {
    await humanDelay('antes de enviar login');
    await clickIfExists(page, site.loginSelectors.submit);
  } else {
    console.log('[sessao] Login manual disponivel na janela aberta; aguardando ate 2 minutos.');
  }

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => null);
  await humanDelay('apos login');
  const savedPath = await saveCookies(page, config.sessionsDir, siteKey);
  console.log(`[sessao] Cookies salvos em ${savedPath}`);
}

function familySearchBlockedMessage() {
  return 'FamilySearch retornou Error 15/bloqueio. Abra o Chrome normal, faça login manual, limpe cookies do bot se necessário e rode novamente em modo visível.';
}

function makePageStateError(message, pageState) {
  const error = new Error(message);
  error.pageState = pageState;
  return error;
}

async function authenticateFamilySearch(page, search) {
  const site = SITE_CONFIG.familysearch;

  await gotoWithRetry(page, site.cookieDomainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }, 1);
  const loaded = await loadCookies(page, config.sessionsDir, 'familysearch');

  if (loaded > 0) {
    console.log(`[sessao] ${loaded} cookies reaproveitados para ${site.name}.`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await humanDelay('validando sessao');

    const pageState = await detectPageState(page);
    if (pageState === 'blocked_or_captcha') {
      await saveDebugArtifacts(page, search, pageState);
      throw makePageStateError(familySearchBlockedMessage(), pageState);
    }

    if (pageState !== 'login_required' && pageState !== 'session_expired') {
      return;
    }

    console.log('[sessao] Cookies do FamilySearch nao parecem validos. Abrindo login manual.');
  }

  console.log('[sessao] Faça login manualmente no FamilySearch na janela aberta.');
  console.log('[sessao] Depois que o login carregar, aguarde. O bot salvará os cookies automaticamente.');

  await gotoWithRetry(page, site.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }, 1);
  await page.waitForFunction(() => {
    const text = document.body?.innerText?.replace(/\s+/g, ' ').toLowerCase() || '';
    const hasPassword = Boolean(document.querySelector('input[type="password"]'));
    const hasCaptcha = Boolean(document.querySelector('[class*=\"captcha\" i], [id*=\"captcha\" i], iframe[src*=\"captcha\" i]'));
    const blocked = hasCaptcha || /access denied|error 15|blocked by our security service|captcha|verify you are human|unusual traffic/.test(text);
    const loginPage = hasPassword || window.location.href.toLowerCase().includes('/auth/familysearch/login') || /sign in|log in|entrar/.test(text);
    return blocked || !loginPage;
  }, { timeout: 180000 }).catch(() => null);

  await humanDelay('apos login manual');
  const savedPath = await saveCookies(page, config.sessionsDir, 'familysearch');
  console.log(`[sessao] Cookies salvos em ${savedPath}`);

  const pageState = await detectPageState(page);
  if (pageState === 'blocked_or_captcha') {
    await saveDebugArtifacts(page, search, pageState);
    throw makePageStateError(familySearchBlockedMessage(), pageState);
  }

  if (pageState === 'login_required' || pageState === 'session_expired') {
    await saveDebugArtifacts(page, search, pageState);
    throw makePageStateError('Login manual do FamilySearch nao foi concluido dentro de 3 minutos.', pageState);
  }
}

async function detectPageState(page) {
  const state = await page.evaluate(() => {
    const url = window.location.href.toLowerCase();
    const text = document.body?.innerText?.replace(/\s+/g, ' ').toLowerCase() || '';
    const hasPassword = Boolean(document.querySelector('input[type="password"]'));
    const hasCaptcha = Boolean(document.querySelector('[class*="captcha" i], [id*="captcha" i], iframe[src*="captcha" i]'));
    const links = document.querySelectorAll('a[href]').length;

    if (hasCaptcha || /access denied|error 15|blocked by our security service|captcha|verify you are human|unusual traffic/.test(text)) {
      return 'blocked_or_captcha';
    }

    if (hasPassword || url.includes('/auth/familysearch/login') || /sign in|log in|iniciar sessao|entrar/.test(text)) return 'login_required';
    if (/session expired|sessao expirada|please sign in again/.test(text)) return 'session_expired';
    if (/no results|nenhum resultado|sem resultados|0 results/.test(text)) return 'no_results';
    if (url.includes('/search/record/results')) return 'results_found';
    if (/error|erro|temporarily unavailable/.test(text) && links < 3) return 'generic_error';
    if (links > 0) return 'results_found';
    return 'generic_error';
  }).catch(() => 'generic_error');

  console.log(`[scraper] Estado da pagina: ${state}`);
  return state;
}

function safeArtifactName(search, reason) {
  const id = search.id || [search.givenName, search.surname].filter(Boolean).join('-') || 'search';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${id}-${reason}`.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 180);
}

async function saveDebugArtifacts(page, search, reason) {
  const debugDir = path.join(config.outputDir, 'debug');
  await fsp.mkdir(debugDir, { recursive: true });
  const base = path.join(debugDir, safeArtifactName(search, reason));
  const screenshotPath = `${base}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);

  let htmlPath = null;
  if (config.browser.debugSaveHtml) {
    htmlPath = `${base}.html`;
    const html = await page.content().catch(() => '');
    if (html) await fsp.writeFile(htmlPath, html, 'utf8').catch(() => null);
  }

  console.log(`[debug] Artefatos salvos: ${screenshotPath}${htmlPath ? `, ${htmlPath}` : ''}`);
  return { screenshotPath, htmlPath };
}

async function extractResults(page, siteKey, limit) {
  await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.8))).catch(() => null);
  await humanDelay('rolagem de resultados');

  if (siteKey === 'familysearch') return extractFamilySearchResults(page, limit);
  if (siteKey === 'myheritage') return extractMyHeritageResults(page, limit);
  if (siteKey === 'google') return extractGoogleResults(page, limit);
  if (siteKey === 'bing') return extractBingResults(page, limit);
  if (siteKey === 'duckduckgo') return extractDuckDuckGoResults(page, limit);
  return extractGenericResults(page, limit);
}

async function runSearch(browser, search, birthWindow) {
  const siteKey = siteKeyFor(search);
  const searchUrl = buildSearchUrl(search, birthWindow);

  if (siteKey === 'familysearch' && config.familySearchMode === 'manual') {
    return {
      ok: false,
      manualRequired: true,
      pageState: 'manual_required',
      searchUrl,
      error: 'FamilySearch está em modo manual. Abra esta URL no Chrome normal, copie o texto ou salve o HTML em data/manual e rode a análise manual.',
      extracted: {
        site: 'familysearch',
        title: 'Busca manual FamilySearch',
        rawText: '',
        recordLinks: []
      }
    };
  }

  const page = await browser.newPage();

  try {
    if (config.browser.customUserAgent) {
      await page.setUserAgent(config.browser.customUserAgent);
    }
    await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    if (siteKey === 'familysearch') {
      await authenticateFamilySearch(page, search);
    } else {
      await authenticate(page, siteKey);
    }

    console.log(`[scraper] Buscando ${search.id || search.surname || search.givenName}: ${searchUrl}`);
    await humanDelay('antes da busca');
    await gotoWithRetry(page, searchUrl, { waitUntil: 'networkidle2', timeout: 90000 }, 1);
    await humanDelay('pagina de resultados');

    const pageState = await detectPageState(page);
    if (pageState === 'blocked_or_captcha') {
      await saveDebugArtifacts(page, search, pageState);
      return {
        ok: false,
        searchUrl,
        pageState,
        error: siteKey === 'familysearch'
          ? familySearchBlockedMessage()
          : 'Bloqueio ou captcha detectado. Intervencao manual necessaria; o bot nao tenta contornar.',
        extracted: { site: siteKey, title: '', rawText: '', recordLinks: [] }
      };
    }

    const extracted = await extractResults(page, siteKey, config.browser.resultLimit);
    await saveCookies(page, config.sessionsDir, siteKey).catch(() => null);

    return {
      ok: pageState !== 'generic_error',
      searchUrl,
      pageState,
      error: pageState === 'generic_error' ? 'Estado generico de erro detectado na pagina.' : undefined,
      extracted: {
        site: siteKey,
        ...extracted
      }
    };
  } catch (error) {
    const pageState = error.pageState || await detectPageState(page).catch(() => 'generic_error');
    const reason = pageState === 'blocked_or_captcha' ? pageState : 'error';
    await saveDebugArtifacts(page, search, reason).catch(() => null);
    return {
      ok: false,
      searchUrl,
      pageState,
      error: pageState === 'blocked_or_captcha' && siteKey === 'familysearch'
        ? familySearchBlockedMessage()
        : error.message,
      extracted: {
        site: siteKey,
        title: '',
        rawText: '',
        recordLinks: []
      }
    };
  } finally {
    await page.close().catch(() => null);
  }
}

module.exports = {
  SITE_CONFIG,
  createBrowser,
  runSearch,
  buildSearchUrl,
  detectPageState,
  saveDebugArtifacts,
  gotoWithRetry,
  humanDelay
};
