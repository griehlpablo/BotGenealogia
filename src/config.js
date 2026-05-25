const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const rootDir = path.resolve(__dirname, '..');

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
}

function listFromEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  rootDir,
  inputPath: process.env.INPUT_PATH || path.join(rootDir, 'data', 'input.json'),
  outputDir: process.env.OUTPUT_DIR || path.join(rootDir, 'output'),
  sessionsDir: process.env.SESSIONS_DIR || path.join(rootDir, 'sessions'),
  browser: {
    headless: boolFromEnv('HEADLESS', false),
    slowMo: numberFromEnv('SLOW_MODE_MS', 250),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    userDataDir: process.env.PUPPETEER_USER_DATA_DIR || undefined,
    customUserAgent: process.env.CUSTOM_USER_AGENT || undefined,
    extraArgs: listFromEnv('PUPPETEER_EXTRA_ARGS'),
    minDelayMs: numberFromEnv('MIN_DELAY_MS', 3000),
    maxDelayMs: numberFromEnv('MAX_DELAY_MS', 8000),
    resultLimit: numberFromEnv('RESULT_LIMIT', 5),
    debugSaveHtml: boolFromEnv('DEBUG_SAVE_HTML', false)
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest',
    geminiPdfModel: process.env.GEMINI_PDF_MODEL,
    geminiFallbackModels: listFromEnv('GEMINI_FALLBACK_MODELS')
  },
  familySearchMode: ['manual', 'browser'].includes((process.env.FAMILYSEARCH_MODE || '').toLowerCase())
    ? process.env.FAMILYSEARCH_MODE.toLowerCase()
    : 'manual',
  webSearch: {
    provider: (process.env.WEB_SEARCH_PROVIDER || 'duckduckgo').toLowerCase(),
    limit: numberFromEnv('WEB_SEARCH_LIMIT', 10),
    maxQueries: numberFromEnv('WEB_SEARCH_MAX_QUERIES', 30),
    collectMaxPages: numberFromEnv('WEB_COLLECT_MAX_PAGES', 20),
    queueMaxDepth: numberFromEnv('WEB_QUEUE_MAX_DEPTH', 1),
    delayMinMs: numberFromEnv('WEB_SEARCH_DELAY_MIN_MS', 3000),
    delayMaxMs: numberFromEnv('WEB_SEARCH_DELAY_MAX_MS', 9000),
    collectDelayMinMs: numberFromEnv('WEB_COLLECT_DELAY_MIN_MS', 3000),
    collectDelayMaxMs: numberFromEnv('WEB_COLLECT_DELAY_MAX_MS', 10000)
  },
  credentials: {
    familysearch: {
      email: process.env.FAMILYSEARCH_EMAIL,
      password: process.env.FAMILYSEARCH_PASSWORD
    },
    myheritage: {
      email: process.env.MYHERITAGE_EMAIL,
      password: process.env.MYHERITAGE_PASSWORD
    }
  }
};
