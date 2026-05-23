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

function confidenceOf(result) {
  return result.aiAnalysis?.confidence || 'low';
}

function summarize(results) {
  return results.reduce((acc, result) => {
    acc.total += 1;
    if (result.error || !result.ok) acc.errors += 1;
    const confidence = confidenceOf(result);
    acc[confidence] = (acc[confidence] || 0) + 1;
    return acc;
  }, { total: 0, errors: 0, high: 0, medium: 0, low: 0 });
}

function renderLinks(links = []) {
  if (links.length === 0) return '<p class="muted">Nenhum link extraido automaticamente.</p>';
  return `<ul>${links
    .map((link) => `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.text)}</a></li>`)
    .join('')}</ul>`;
}

function renderRelationships(relationships = []) {
  if (relationships.length === 0) return '<p class="muted">Sem relacoes familiares detectadas.</p>';
  return `<ul>${relationships.map((relation) => `
    <li>
      <strong>${escapeHtml(relation.type)}:</strong> ${escapeHtml(relation.name)}
      ${relation.evidenceText ? `<br><span class="evidence">${escapeHtml(relation.evidenceText)}</span>` : ''}
    </li>`).join('')}</ul>`;
}

function renderWarnings(warnings = []) {
  if (warnings.length === 0) return '';
  return `<ul class="warnings">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
}

function renderMatches(matches = []) {
  if (matches.length === 0) return '<p class="muted">Nenhuma hipotese estruturada encontrada.</p>';
  return matches.map((match) => `
    <article class="match ${escapeHtml(match.confidenceLabel)}">
      <h4>${escapeHtml(match.personName || 'Pessoa sem nome claro')}</h4>
      <p>
        <strong>Confianca IA:</strong> ${escapeHtml(match.confidenceLabel)}
        <span> | </span>
        <strong>Score IA:</strong> ${escapeHtml(match.confidenceScore)}
        <span> | </span>
        <strong>Score objetivo:</strong> ${escapeHtml(match.objectiveScore ?? '')}
      </p>
      ${renderWarnings(match.warnings)}
      <p><strong>Nascimento:</strong> ${escapeHtml(match.birth?.date)} ${escapeHtml(match.birth?.place)}</p>
      <p><strong>Obito:</strong> ${escapeHtml(match.death?.date)} ${escapeHtml(match.death?.place)}</p>
      <h5>Relacoes e evidencias</h5>
      ${renderRelationships(match.relationships)}
    </article>
  `).join('');
}

function renderSuggestions(suggestions = []) {
  if (suggestions.length === 0) return '<p class="muted">Sem proximas buscas sugeridas.</p>';
  return `<ul>${suggestions.map((suggestion) => {
    const name = [suggestion.givenName, suggestion.surname].filter(Boolean).join(' ');
    return `<li>${escapeHtml(name || suggestion.surname || 'Busca sem nome')} - ${escapeHtml(suggestion.place || '')} ${escapeHtml(suggestion.reason || '')}</li>`;
  }).join('')}</ul>`;
}

function renderResult(result) {
  const name = [result.search.givenName, result.search.surname].filter(Boolean).join(' ') || result.search.surname || result.search.id;
  const confidence = confidenceOf(result);
  return `
    <section class="result ${escapeHtml(confidence)}">
      <header>
        <h2>${escapeHtml(name || 'Busca sem nome')}</h2>
        <p>
          <strong>Site:</strong> ${escapeHtml(result.search.site || 'familysearch')}
          <span> | </span>
          <strong>Janela:</strong> ${escapeHtml(formatYearRange(result.birthWindow) || 'nao calculada')}
          <span> | </span>
          <strong>Confianca geral:</strong> ${escapeHtml(confidence)}
        </p>
        <p>
          <strong>Estado:</strong> ${escapeHtml(result.pageState || 'nao informado')}
          <span> | </span>
          <a href="${escapeHtml(result.searchUrl)}" target="_blank" rel="noreferrer">Abrir busca original</a>
        </p>
      </header>
      ${result.error ? `<p class="error">Erro no scraping: ${escapeHtml(result.error)}</p>` : ''}
      <h3>Hipoteses</h3>
      ${renderMatches(result.aiAnalysis?.matches)}
      <h3>Proximas buscas sugeridas</h3>
      ${renderSuggestions(result.aiAnalysis?.nextSearchSuggestions)}
      <h3>Links extraidos</h3>
      ${renderLinks(result.recordLinks)}
      <details>
        <summary>Texto bruto extraido</summary>
        <pre>${escapeHtml(result.rawText || '')}</pre>
      </details>
      <details>
        <summary>Analise JSON completa</summary>
        <pre>${escapeHtml(JSON.stringify(result.aiAnalysis, null, 2))}</pre>
      </details>
    </section>
  `;
}

async function writeHtmlReport(results) {
  await fs.mkdir(config.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(config.outputDir, `relatorio-${stamp}.html`);
  const jsonPath = path.join(config.outputDir, `relatorio-${stamp}.json`);
  const summary = summarize(results);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relatorio Genealogico</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2933; background: #f7f9fb; }
    main { max-width: 1100px; margin: 0 auto; }
    section, .summary { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 20px; margin: 18px 0; }
    h1, h2, h3, h4, h5 { margin-top: 0; }
    a { color: #005ea8; }
    pre { background: #111827; color: #e5e7eb; padding: 14px; overflow: auto; border-radius: 6px; white-space: pre-wrap; }
    .muted { color: #68778d; }
    .error, .warnings { color: #a61b1b; font-weight: 700; }
    .match { border-left: 5px solid #94a3b8; padding: 12px 14px; margin: 12px 0; background: #f8fafc; }
    .match.high, .result.high { border-color: #15803d; }
    .match.medium, .result.medium { border-color: #b45309; }
    .match.low, .result.low { border-color: #b91c1c; }
    .evidence { color: #334155; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>Relatorio Genealogico</h1>
    <p class="muted">Gerado localmente em ${escapeHtml(new Date().toLocaleString('pt-BR'))}.</p>
    <div class="summary">
      <h2>Resumo</h2>
      <p>
        <strong>Total:</strong> ${summary.total}
        <span> | </span>
        <strong>Erros:</strong> ${summary.errors}
        <span> | </span>
        <strong>Alta:</strong> ${summary.high}
        <span> | </span>
        <strong>Media:</strong> ${summary.medium}
        <span> | </span>
        <strong>Baixa:</strong> ${summary.low}
      </p>
    </div>
    ${results.map(renderResult).join('\n')}
  </main>
</body>
</html>`;

  await fs.writeFile(htmlPath, html, 'utf8');
  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2), 'utf8');
  return { htmlPath, jsonPath };
}

module.exports = {
  writeHtmlReport
};
