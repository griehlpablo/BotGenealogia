const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { formatYearRange } = require('./logic');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function prettyJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function renderLinks(links = []) {
  if (links.length === 0) return '<p class="muted">Nenhum link extraido automaticamente.</p>';
  return `<ul>${links
    .map((link) => `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.text)}</a></li>`)
    .join('')}</ul>`;
}

function renderResult(result) {
  const name = [result.search.givenName, result.search.surname].filter(Boolean).join(' ') || result.search.surname || result.search.id;
  return `
    <section>
      <header>
        <h2>${escapeHtml(name)}</h2>
        <p>
          <strong>Site:</strong> ${escapeHtml(result.search.site || 'familysearch')}
          <span> | </span>
          <strong>Janela:</strong> ${escapeHtml(formatYearRange(result.birthWindow) || 'nao calculada')}
        </p>
        <p><a href="${escapeHtml(result.searchUrl)}" target="_blank" rel="noreferrer">Abrir busca original</a></p>
      </header>
      ${result.error ? `<p class="error">Erro no scraping: ${escapeHtml(result.error)}</p>` : ''}
      <h3>Hipoteses da IA</h3>
      <pre>${prettyJson(result.aiAnalysis)}</pre>
      <h3>Links extraidos</h3>
      ${renderLinks(result.recordLinks)}
      <details>
        <summary>Texto bruto extraido</summary>
        <pre>${escapeHtml(result.rawText || '')}</pre>
      </details>
    </section>
  `;
}

async function writeHtmlReport(results) {
  await fs.mkdir(config.outputDir, { recursive: true });
  const file = path.join(config.outputDir, `relatorio-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relatorio Genealogico</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2933; background: #f7f9fb; }
    main { max-width: 1100px; margin: 0 auto; }
    section { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 20px; margin: 18px 0; }
    h1, h2, h3 { margin-top: 0; }
    a { color: #005ea8; }
    pre { background: #111827; color: #e5e7eb; padding: 14px; overflow: auto; border-radius: 6px; white-space: pre-wrap; }
    .muted { color: #68778d; }
    .error { color: #a61b1b; font-weight: 700; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>Relatorio Genealogico</h1>
    <p class="muted">Gerado localmente em ${escapeHtml(new Date().toLocaleString('pt-BR'))}.</p>
    ${results.map(renderResult).join('\n')}
  </main>
</body>
</html>`;

  await fs.writeFile(file, html, 'utf8');
  return file;
}

module.exports = {
  writeHtmlReport
};
