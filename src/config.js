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

module.exports = {
  rootDir,
  inputPath: process.env.INPUT_PATH || path.join(rootDir, 'data', 'input.json'),
  outputDir: process.env.OUTPUT_DIR || path.join(rootDir, 'output'),
  sessionsDir: process.env.SESSIONS_DIR || path.join(rootDir, 'sessions'),
  browser: {
    headless: boolFromEnv('HEADLESS', false),
    slowMo: numberFromEnv('SLOW_MODE_MS', 250),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    minDelayMs: numberFromEnv('MIN_DELAY_MS', 1000),
    maxDelayMs: numberFromEnv('MAX_DELAY_MS', 4000),
    resultLimit: numberFromEnv('RESULT_LIMIT', 5)
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
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
