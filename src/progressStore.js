const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { retryDaysForStatus } = require('./resultStatus');

const progressPath = path.join(config.outputDir, 'search-progress.json');

function searchKey(search = {}, source = '') {
  return [
    source,
    search.id,
    search.givenName,
    search.surname,
    search.place,
    search.birthYear,
    search.reason
  ].filter(Boolean).join('|').toLowerCase();
}

async function readProgress() {
  try {
    const raw = await fs.readFile(progressPath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return {
      people: parsed.people || {},
      cursorBySource: parsed.cursorBySource || {},
      activePlans: parsed.activePlans || []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { people: {}, cursorBySource: {}, activePlans: [] };
    console.warn(`[progress] Falha ao ler progresso: ${error.message}`);
    return { people: {}, cursorBySource: {}, activePlans: [] };
  }
}

async function writeProgress(progress) {
  await fs.mkdir(config.outputDir, { recursive: true });
  await fs.writeFile(progressPath, JSON.stringify(progress, null, 2), 'utf8');
}

function isCoolingDown(entry, now = new Date()) {
  if (!entry?.retryAfter) return false;
  return Date.parse(entry.retryAfter) > now.getTime();
}

function retryAfterFor(status, now = new Date()) {
  const days = retryDaysForStatus(status);
  if (days <= 0) return '';
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function updatePersonProgress({ search, source, result, status, now = new Date() }) {
  const progress = await readProgress();
  const key = searchKey(search, source);
  const shouldRetryAfterDays = retryDaysForStatus(status);
  progress.people[key] = {
    key,
    source,
    lastRunAt: now.toISOString(),
    status,
    pageState: result.pageState,
    shouldRetryAfterDays,
    retryAfter: retryAfterFor(status, now),
    reason: result.error || result.diagnostics?.skippedReasons?.[0]?.reason || ''
  };
  await writeProgress(progress);
  return progress.people[key];
}

async function getNextSearchesForRun(searches, source, options = {}) {
  const progress = options.progress || await readProgress();
  const now = options.now || new Date();
  const maxAttempts = options.maxAttempts || config.webSearch.maxAttemptsPerRun || 10;
  const selected = [];
  const skipped = [];
  const start = progress.cursorBySource[source] || 0;

  for (let offset = 0; offset < searches.length && selected.length < maxAttempts; offset += 1) {
    const index = (start + offset) % searches.length;
    const search = searches[index];
    const key = searchKey(search, source);
    const entry = progress.people[key];
    if (isCoolingDown(entry, now)) {
      skipped.push({ search, key, reason: `cooldown ate ${entry.retryAfter}`, retryAfter: entry.retryAfter });
      continue;
    }
    selected.push({ search, key, index });
  }

  if (selected.length > 0) {
    progress.cursorBySource[source] = (selected[selected.length - 1].index + 1) % searches.length;
    if (!options.skipWrite) await writeProgress(progress);
  }

  return {
    searches: selected,
    skipped,
    message: selected.length ? '' : 'Todas as pessoas estao em cooldown ou nao ha candidatos disponiveis.'
  };
}

module.exports = {
  readProgress,
  writeProgress,
  updatePersonProgress,
  getNextSearchesForRun,
  searchKey,
  retryAfterFor
};
