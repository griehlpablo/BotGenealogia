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
  const normalizedLinks = links.map((link) => {
    if (typeof link === 'string') return { href: link, text: link };
    return { href: link?.href || '', text: link?.text || link?.href || '' };
  });
  const validLinks = normalizedLinks.filter((link) => {
    const href = String(link.href || '').trim();
    return href && href !== '#' && !href.toLowerCase().startsWith('javascript:');
  });
  if (validLinks.length === 0) return '<p class="muted">Nenhum link extraido automaticamente.</p>';
  return `<ul>${validLinks
    .map((link) => `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.text || link.href)}</a></li>`)
    .join('')}</ul>`;
}

function renderWebResults(results = []) {
  if (results.length === 0) return '<p class="muted">Nenhum resultado web coletado.</p>';
  return `<ul>${results.map((result) => `
    <li>
      ${result.url
        ? `<a href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">${escapeHtml(result.title || result.url)}</a>`
        : `<strong>${escapeHtml(result.title || result.query || 'Resultado pulado')}</strong>`}
      <br><small>${escapeHtml(result.sourceType)} | score objetivo: ${escapeHtml(result.objectiveScore ?? '')} | preScore: ${escapeHtml(result.preScore ?? '')} | ${escapeHtml(result.pageState || 'ok')} | ${result.collected === false ? `pulado: ${escapeHtml(result.skipReason || '')}` : 'coletado'}</small>
      ${result.snippet ? `<p>${escapeHtml(result.snippet)}</p>` : ''}
      ${result.preScorePenalties?.length ? `<p class="muted">Penalidades: ${escapeHtml(result.preScorePenalties.join(' | '))}</p>` : ''}
    </li>`).join('')}</ul>`;
}

function renderManualSources(sources = []) {
  if (sources.length === 0) return '<p class="muted">Nenhuma fonte manual identificada.</p>';
  return `<ul>${sources.map((source) => `
    <li>
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
      <br><small>${escapeHtml(source.sourceType || 'manual')} ${source.reason ? `| ${escapeHtml(source.reason)}` : ''}</small>
    </li>`).join('')}</ul>`;
}

function renderDiagnostics(diagnostics) {
  if (!diagnostics) return '<p class="muted">Diagnostico nao disponivel.</p>';
  return `
    <dl>
      <dt>queriesGenerated</dt><dd>${escapeHtml(diagnostics.queriesGenerated ?? 0)}</dd>
      <dt>queriesTried</dt><dd>${escapeHtml((diagnostics.queriesTried || []).length)}</dd>
      <dt>searchResultsFound</dt><dd>${escapeHtml(diagnostics.searchResultsFound ?? 0)}</dd>
      <dt>urlsVisited</dt><dd>${escapeHtml(diagnostics.urlsVisited ?? 0)}</dd>
      <dt>pagesCollected</dt><dd>${escapeHtml(diagnostics.pagesCollected ?? 0)}</dd>
      <dt>pagesSkipped</dt><dd>${escapeHtml(diagnostics.pagesSkipped ?? 0)}</dd>
      <dt>queriesSkipped</dt><dd>${escapeHtml(diagnostics.queriesSkipped ?? 0)}</dd>
      <dt>urlsSkippedBeforeCollect</dt><dd>${escapeHtml(diagnostics.urlsSkippedBeforeCollect ?? 0)}</dd>
      <dt>excludedDomainsSkipped</dt><dd>${escapeHtml(diagnostics.excludedDomainsSkipped ?? 0)}</dd>
      <dt>lowRelevanceSkipped</dt><dd>${escapeHtml(diagnostics.lowRelevanceSkipped ?? 0)}</dd>
      <dt>captchaDetected</dt><dd>${escapeHtml(Boolean(diagnostics.captchaDetected))}</dd>
    </dl>
    ${diagnostics.providerCooldown ? `<p class="error">Cooldown do provedor: ${escapeHtml(JSON.stringify(diagnostics.providerCooldown))}</p>` : ''}
    <details>
      <summary>Queries tentadas</summary>
      <pre>${escapeHtml(JSON.stringify(diagnostics.queriesTried || [], null, 2))}</pre>
    </details>
    <details>
      <summary>Motivos de pulo</summary>
      <pre>${escapeHtml(JSON.stringify(diagnostics.skippedReasons || [], null, 2))}</pre>
    </details>
    <details>
      <summary>Buscas tentadas</summary>
      <pre>${escapeHtml(JSON.stringify(diagnostics.searchesTried || [], null, 2))}</pre>
    </details>
    <details>
      <summary>Erros de busca</summary>
      <pre>${escapeHtml(JSON.stringify(diagnostics.searchErrors || [], null, 2))}</pre>
    </details>
    <details>
      <summary>Erros de coleta</summary>
      <pre>${escapeHtml(JSON.stringify(diagnostics.collectErrors || [], null, 2))}</pre>
    </details>
  `;
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
  const validSuggestions = suggestions.filter((suggestion) => {
    const name = [suggestion.givenName, suggestion.surname].filter(Boolean).join(' ');
    return Boolean(name || suggestion.place || suggestion.reason);
  });
  if (validSuggestions.length === 0) return '<p class="muted">Sem proximas buscas sugeridas.</p>';
  return `<ul>${validSuggestions.map((suggestion) => {
    const name = [suggestion.givenName, suggestion.surname].filter(Boolean).join(' ');
    return `<li>${escapeHtml(name || suggestion.surname || 'Busca sem nome')} - ${escapeHtml(suggestion.place || '')} ${escapeHtml(suggestion.reason || '')}</li>`;
  }).join('')}</ul>`;
}

function renderResult(result) {
  const name = [result.search.givenName, result.search.surname].filter(Boolean).join(' ') || result.search.surname || result.search.id;
  const confidence = confidenceOf(result);
  const captchaProvider = result.diagnostics?.providerCooldown?.provider
    || result.diagnostics?.searchErrors?.find((item) => item.captchaDetected)?.provider
    || 'web';
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
      ${result.diagnostics?.captchaDetected
        ? `<p class="error">Captcha detectado no provedor ${escapeHtml(captchaProvider)}. A execucao foi interrompida para evitar insistencia.</p>`
        : ''}
      <h3>Hipoteses</h3>
      ${result.aiAnalysis === null
        ? '<p class="muted">Nenhuma analise por IA foi executada porque nenhum texto publico foi coletado.</p>'
        : renderMatches(result.aiAnalysis?.matches)}
      <h3>Proximas buscas sugeridas</h3>
      ${result.aiAnalysis === null
        ? '<p class="muted">Sem proximas buscas sugeridas porque a IA nao foi executada.</p>'
        : renderSuggestions(result.aiAnalysis?.nextSearchSuggestions)}
      <h3>Resultados web encontrados</h3>
      ${renderWebResults(result.webResults)}
      <h3>Fontes que exigem acao manual</h3>
      ${renderManualSources(result.manualSources)}
      <h3>Diagnostico</h3>
      ${renderDiagnostics(result.diagnostics)}
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
    dt { font-weight: 700; float: left; clear: left; min-width: 190px; }
    dd { margin: 6px 0 6px 200px; }
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
