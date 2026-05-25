const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.html', '.htm']);
const MAX_RAW_TEXT_LENGTH = 14000;

function stripHtmlTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFamilySearchLinks(html) {
  const links = new Set();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html))) {
    const href = String(match[1]).trim();
    if (!href) continue;
    if (/familysearch\.org|\/ark:|\/tree\/person|\/search\/record/i.test(href)) {
      links.add(href);
    }
  }

  return Array.from(links).map((href) => ({ href, text: href }));
}

function normalizeTitleFromFilename(filename) {
  const name = path.basename(filename, path.extname(filename));
  return `Manual FamilySearch - ${name}`;
}

async function readManualInputs() {
  const manualDir = path.join(config.rootDir, 'data', 'manual');
  let entries;

  try {
    entries = await fs.readdir(manualDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));

  const results = [];

  for (const file of files) {
    const sourceFile = path.join(manualDir, file.name);
    const extension = path.extname(file.name).toLowerCase();
    let content = await fs.readFile(sourceFile, 'utf8').catch(() => '');
    let rawText = '';
    let recordLinks = [];

    if (extension === '.txt') {
      rawText = content.trim();
      recordLinks = [];
    } else {
      rawText = stripHtmlTags(content);
      recordLinks = extractFamilySearchLinks(content);
    }

    rawText = rawText.slice(0, MAX_RAW_TEXT_LENGTH);

    results.push({
      id: path.basename(file.name, extension),
      site: 'familysearch',
      sourceFile,
      title: normalizeTitleFromFilename(file.name),
      rawText,
      recordLinks
    });
  }

  return results;
}

module.exports = {
  readManualInputs
};
