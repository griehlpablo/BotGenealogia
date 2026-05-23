const { confidenceLabelFromScore } = require('./validators');

function textIncludes(haystack, needle) {
  if (!haystack || !needle) return false;
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

function extractYear(value) {
  const match = String(value || '').match(/\b(1[4-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function scoreMatch(match, search = {}, birthWindow) {
  let score = 0;
  const warnings = [];
  const personText = [
    match.personName,
    ...(match.matchedSurnames || []),
    match.birth?.place,
    match.birth?.date,
    match.death?.place,
    match.death?.date,
    match.reasoning
  ].join(' ');

  if (search.givenName && textIncludes(match.personName, search.givenName)) score += 20;
  if (search.surname && textIncludes(personText, search.surname)) score += 20;
  if (search.place && textIncludes(personText, search.place)) score += 15;

  const birthYear = extractYear(match.birth?.date);
  if (birthYear && birthWindow?.from && birthWindow?.to) {
    if (birthYear >= birthWindow.from && birthYear <= birthWindow.to) {
      score += 20;
    } else {
      warnings.push(`Ano de nascimento ${birthYear} fora da janela ${birthWindow.from}-${birthWindow.to}.`);
    }
  }

  if ((match.relationships || []).length > 0) score += 15;
  if ((match.relationships || []).some((relation) => relation.evidenceText)) score += 10;

  const objectiveScore = Math.max(0, Math.min(100, score));
  if (match.confidenceLabel === 'high' && objectiveScore < 40) {
    warnings.push('IA indicou alta confianca, mas a pontuacao objetiva ficou baixa.');
  }

  return {
    ...match,
    objectiveScore,
    objectiveConfidenceLabel: confidenceLabelFromScore(objectiveScore),
    warnings: [...(match.warnings || []), ...warnings]
  };
}

function scoreAnalysis(aiAnalysis, search, birthWindow) {
  const matches = (aiAnalysis.matches || []).map((match) => scoreMatch(match, search, birthWindow));
  return {
    ...aiAnalysis,
    matches
  };
}

module.exports = {
  scoreMatch,
  scoreAnalysis
};
