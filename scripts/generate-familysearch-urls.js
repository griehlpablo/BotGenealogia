const fs = require('fs/promises');
const path = require('path');
const config = require('../src/config');
const { buildSearchUrl } = require('../src/scraper');
const { deduceBirthWindow } = require('../src/logic');
const { normalizeSearch } = require('../src/validators');
const { analyzeTreePdf } = require('../src/pdfReader');

const TEST_SURNAMES = new Set(['griehl', 'pylypiw']);
const SOURCE_CHOICES = new Set(['input', 'pdf', 'all']);

function parseSourceArg() {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--source='));
  const source = arg ? arg.split('=')[1]?.toLowerCase() : 'input';
  return SOURCE_CHOICES.has(source) ? source : 'input';
}

function formatOrigin(source, extra) {
  if (source === 'input') return 'input.json';
  if (source === 'pdf') return `pdf:${extra}`;
  return extra || 'mixed';
}

function normalizeOrigin(origin) {
  return origin.replace(/\s+/g, ' ').trim();
}

function normalizeSearchWithSite(search) {
  const normalized = normalizeSearch(search);
  if (!normalized.site) normalized.site = 'familysearch';
  return normalized;
}

async function readInputSearches() {
  try {
    const raw = await fs.readFile(path.join(config.rootDir, 'data', 'input.json'), 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.searches)) return [];
    return parsed.searches.map(normalizeSearchWithSite);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[urls:familysearch] data/input.json nao encontrado. Usando searches: [].');
      return [];
    }
    console.warn(`[urls:familysearch] Falha ao ler data/input.json: ${error.message}. Usando searches: []`);
    return [];
  }
}

async function readPdfSearches() {
  const pdfDir = path.join(config.rootDir, 'data', 'pdfs');
  let entries;

  try {
    entries = await fs.readdir(pdfDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const pdfFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name);

  const results = [];

  for (const fileName of pdfFiles) {
    const filePath = path.join(pdfDir, fileName);
    try {
      console.log(`[urls:familysearch] Lendo PDF: ${fileName}`);
      const searches = await analyzeTreePdf(filePath);
      for (const search of searches) {
        results.push({
          search: normalizeSearchWithSite(search),
          origin: formatOrigin('pdf', fileName)
        });
      }
    } catch (error) {
      console.warn(`[urls:familysearch] Falha ao analisar PDF ${fileName}: ${error.message}`);
    }
  }

  return results;
}

function filterFamilySearch(searchItems) {
  return searchItems.filter((item) => {
    const site = (item.search.site || 'familysearch').toLowerCase();
    return site === 'familysearch';
  });
}

function buildDedupKey(search, birthWindow) {
  return [
    (search.surname || '').toLowerCase().trim(),
    (search.givenName || '').toLowerCase().trim(),
    (search.place || '').toLowerCase().trim(),
    birthWindow?.from || '',
    birthWindow?.to || ''
  ].join('|');
}

function buildLabel(search) {
  return [search.givenName, search.surname].filter(Boolean).join(' ') || search.id || 'sem-nome';
}

async function main() {
  const source = parseSourceArg();
  const sourceDescription = source === 'input' ? 'data/input.json' : source === 'pdf' ? 'data/pdfs' : 'data/input.json + data/pdfs';
  console.log(`[urls:familysearch] Fonte usada: ${sourceDescription}`);

  const allItems = [];

  if (source === 'input' || source === 'all') {
    const inputSearches = await readInputSearches();
    for (const search of inputSearches) {
      allItems.push({ search, origin: formatOrigin('input') });
    }
  }

  if (source === 'pdf' || source === 'all') {
    const pdfSearches = await readPdfSearches();
    allItems.push(...pdfSearches);
  }

  const filtered = filterFamilySearch(allItems);
  const deduped = new Map();
  const lines = [];
  const warnings = new Set();

  for (const item of filtered) {
    const birthWindow = deduceBirthWindow(item.search);
    const key = buildDedupKey(item.search, birthWindow);
    const label = buildLabel(item.search);
    const url = buildSearchUrl(item.search, birthWindow);

    const originValue = normalizeOrigin(item.origin);
    const existing = deduped.get(key);

    if (existing) {
      existing.origins.add(originValue);
      continue;
    }

    deduped.set(key, {
      search: item.search,
      birthWindow,
      label,
      url,
      origins: new Set([originValue])
    });

    const surname = (item.search.surname || '').toLowerCase().trim();
    if (TEST_SURNAMES.has(surname)) {
      warnings.add(surname);
    }
  }

  for (const entry of deduped.values()) {
    const originLabel = Array.from(entry.origins).join(' + ');
    lines.push(`[${originLabel}] ${entry.label}: ${entry.url}`);
  }

  if (warnings.size > 0) {
    for (const surname of warnings) {
      console.warn(`[aviso] Sobrenome ${surname.charAt(0).toUpperCase() + surname.slice(1)} encontrado. Confirme se nao e dado de teste em data/input.json.`);
    }
  }

  await fs.mkdir(config.outputDir, { recursive: true });
  const outputPath = path.join(config.outputDir, `familysearch-urls.${source}.txt`);
  await fs.writeFile(outputPath, lines.join('\n'), 'utf8');

  console.log('[urls:familysearch] URLs geradas:');
  lines.forEach((line) => console.log(line));
  console.log(`\n[urls:familysearch] Gravado em ${outputPath}`);
}

main().catch((error) => {
  console.error('[urls:familysearch] Erro inesperado:', error);
  process.exitCode = 1;
});
