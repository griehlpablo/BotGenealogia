const fs = require('fs/promises');
const path = require('path');
const config = require('../src/config');
const { normalizeSearch } = require('../src/validators');
const { analyzeTreePdf } = require('../src/pdfReader');
const { generateQueries } = require('../src/queryGenerator');

function parseSourceArg() {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--source='));
  const value = arg ? arg.split('=')[1]?.toLowerCase() : 'input';
  return ['input', 'pdf', 'all'].includes(value) ? value : 'input';
}

async function readInputSearches() {
  try {
    const raw = await fs.readFile(path.join(config.rootDir, 'data', 'input.json'), 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.searches)) return [];
    return parsed.searches.map(normalizeSearch);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[queries:web] data/input.json nao encontrado. Usando searches: [].');
      return [];
    }
    console.warn(`[queries:web] Falha ao ler data/input.json: ${error.message}. Usando searches: []`);
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
      console.log(`[queries:web] Analisando PDF: ${fileName}`);
      const searches = await analyzeTreePdf(filePath);
      results.push(...searches.map(normalizeSearch));
    } catch (error) {
      console.warn(`[queries:web] Falha ao analisar PDF ${fileName}: ${error.message}`);
    }
  }

  return results;
}

async function main() {
  const source = parseSourceArg();
  console.log(`[queries:web] Fonte: ${source}`);

  const inputSearches = (source === 'input' || source === 'all') ? await readInputSearches() : [];
  const pdfSearches = (source === 'pdf' || source === 'all') ? await readPdfSearches() : [];
  const searches = [...inputSearches, ...pdfSearches];

  const lines = [];
  for (const search of searches) {
    const queries = generateQueries(search);
    const label = [search.givenName, search.surname].filter(Boolean).join(' ') || search.id || 'sem-nome';
    for (const query of queries) {
      lines.push(`[${source}] [${query.priority}] [${query.purpose}] ${query.query}`);
    }
  }

  const outputPath = path.join(config.outputDir, `web-queries.${source}.txt`);
  await fs.mkdir(config.outputDir, { recursive: true });
  await fs.writeFile(outputPath, lines.join('\n'), 'utf8');

  console.log('[queries:web] Consultas geradas:');
  lines.forEach((line) => console.log(line));
  console.log(`\n[queries:web] Gravado em ${outputPath}`);
}

main().catch((error) => {
  console.error('[queries:web] Erro inesperado:', error);
  process.exitCode = 1;
});
