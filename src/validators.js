function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value, mapper = stringOrEmpty) {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter((item) => item !== '' && item !== null && item !== undefined);
}

function isValidYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1400 && year <= new Date().getFullYear() + 5;
}

function normalizeYearArray(values) {
  return normalizeArray(values, (value) => (isValidYear(value) ? Number(value) : null));
}

function normalizeRange(range) {
  if (!range || typeof range !== 'object') return undefined;
  const from = Number(range.from);
  const to = Number(range.to);
  if (!isValidYear(from) || !isValidYear(to)) return undefined;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function normalizeSearch(search = {}) {
  const source = search && typeof search === 'object' ? search : {};
  const site = stringOrEmpty(source.site).toLowerCase() || 'familysearch';
  const birthYear = isValidYear(source.birthYear) ? Number(source.birthYear) : undefined;
  const birthYearTolerance = Number.isFinite(Number(source.birthYearTolerance))
    ? Math.max(0, Math.min(50, Number(source.birthYearTolerance)))
    : undefined;

  return {
    ...source,
    id: stringOrEmpty(source.id),
    site,
    givenName: stringOrEmpty(source.givenName),
    surname: stringOrEmpty(source.surname),
    place: stringOrEmpty(source.place),
    role: stringOrEmpty(source.role || source.targetRelation || 'unknown').toLowerCase(),
    targetRelation: stringOrEmpty(source.targetRelation || source.role || 'unknown').toLowerCase(),
    birthYear,
    birthYearTolerance,
    birthYearRange: normalizeRange(source.birthYearRange),
    childrenBirthYears: normalizeYearArray(source.childrenBirthYears),
    knownSpouseBirthYear: isValidYear(source.knownSpouseBirthYear)
      ? Number(source.knownSpouseBirthYear)
      : undefined,
    knownAliveYear: isValidYear(source.knownAliveYear) ? Number(source.knownAliveYear) : undefined,
    deathYear: isValidYear(source.deathYear) ? Number(source.deathYear) : undefined,
    reason: stringOrEmpty(source.reason)
  };
}

function confidenceLabelFromScore(score) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  if (safeScore >= 75) return 'high';
  if (safeScore >= 40) return 'medium';
  return 'low';
}

function normalizeRelationship(value = {}) {
  const allowed = new Set(['father', 'mother', 'spouse', 'child', 'sibling', 'other']);
  const type = stringOrEmpty(value.type).toLowerCase();
  return {
    type: allowed.has(type) ? type : 'other',
    name: stringOrEmpty(value.name),
    evidenceText: stringOrEmpty(value.evidenceText)
  };
}

function normalizeMatch(match = {}) {
  const source = match && typeof match === 'object' ? match : {};
  const score = Math.max(0, Math.min(100, Number(source.confidenceScore) || 0));

  return {
    personName: stringOrEmpty(source.personName),
    matchedSurnames: normalizeArray(source.matchedSurnames),
    birth: {
      date: stringOrEmpty(source.birth?.date),
      place: stringOrEmpty(source.birth?.place)
    },
    death: {
      date: stringOrEmpty(source.death?.date),
      place: stringOrEmpty(source.death?.place)
    },
    relationships: normalizeArray(source.relationships, normalizeRelationship),
    sourceLinks: normalizeArray(source.sourceLinks),
    confidenceScore: score,
    confidenceLabel: confidenceLabelFromScore(score),
    reasoning: stringOrEmpty(source.reasoning),
    warnings: normalizeArray(source.warnings)
  };
}

function emptyAiAnalysis(reason = 'Sem analise disponivel.') {
  return {
    matches: [],
    possibleParents: [],
    children: [],
    surnameVariations: [],
    recordPlaces: [],
    relevantDates: [],
    nextSearchSuggestions: [],
    confidence: 'low',
    reasoning: reason
  };
}

function normalizeAiAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyAiAnalysis('Resposta da IA ausente ou invalida.');
  }

  const matches = normalizeArray(raw.matches, normalizeMatch);
  const explicitConfidence = stringOrEmpty(raw.confidence).toLowerCase();
  const derivedConfidence = matches.length > 0
    ? confidenceLabelFromScore(Math.max(...matches.map((match) => match.confidenceScore)))
    : 'low';

  return {
    matches,
    possibleParents: normalizeArray(raw.possibleParents),
    children: normalizeArray(raw.children),
    surnameVariations: normalizeArray(raw.surnameVariations),
    recordPlaces: normalizeArray(raw.recordPlaces),
    relevantDates: normalizeArray(raw.relevantDates),
    nextSearchSuggestions: normalizeArray(raw.nextSearchSuggestions, normalizeSearch),
    confidence: ['low', 'medium', 'high'].includes(explicitConfidence)
      ? explicitConfidence
      : derivedConfidence,
    reasoning: stringOrEmpty(raw.reasoning)
  };
}

module.exports = {
  normalizeSearch,
  normalizeAiAnalysis,
  emptyAiAnalysis,
  isValidYear,
  normalizeYearArray,
  confidenceLabelFromScore
};
