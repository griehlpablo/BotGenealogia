const { analyzeGenealogyText } = require('./ai');
const config = require('./config');

function clean(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function buildCandidateQueries(targetSearch, facts) {
  const given = clean(targetSearch.givenName);
  const place = clean(facts.place || targetSearch.place);
  const year = facts.year || targetSearch.birthYear;
  const surname = clean(facts.surname || targetSearch.surname);
  const relatives = facts.relatives || [];
  const queries = [];

  if (given && surname && relatives[0]) queries.push(`"${given}" "${relatives[0]}" ${place} ${year || ''}`.replace(/\s+/g, ' ').trim());
  if (given && surname) queries.push(`"${given}" ${surname} ${place} ${year || ''}`.replace(/\s+/g, ' ').trim());
  if (given && surname) queries.push(`"${given}" ${surname} genealogy`);
  if (given && surname) queries.push(`"${given}" ${surname} FamilySearch`);
  return unique(queries);
}

async function enrichWeakPersonWithRelativeResults(targetSearch, relativeResults = []) {
  const rawText = relativeResults
    .map((result) => result.rawText || '')
    .join('\n\n')
    .trim()
    .slice(0, config.webSearch.contextEnrichmentMaxText || 12000);

  if (!rawText) {
    return {
      enrichedSearch: targetSearch,
      discoveredFacts: [],
      candidateQueries: [],
      confidence: 'low',
      reasoning: 'Nenhum texto real de parentes foi coletado; enriquecimento nao executado.'
    };
  }

  const aiAnalysis = await analyzeGenealogyText({
    searchedPerson: targetSearch,
    sourceSite: 'relative_context',
    pageTitle: 'Resultados de parentes',
    resultText: rawText,
    extractedLinks: []
  });

  const discoveredFacts = [];
  const surnames = [];
  const places = [];
  const years = [];
  const relatives = [];

  for (const match of aiAnalysis.matches || []) {
    for (const surname of match.matchedSurnames || []) surnames.push(surname);
    if (match.birth?.place) places.push(match.birth.place);
    if (match.birth?.date) years.push(match.birth.date.match(/\b(1[4-9]\d{2}|20\d{2})\b/)?.[0]);
    for (const relation of match.relationships || []) {
      if (relation.name) relatives.push(relation.name);
    }
  }

  const facts = {
    surname: unique(surnames)[0],
    place: unique(places)[0],
    year: unique(years)[0],
    relatives: unique(relatives)
  };

  if (facts.surname) discoveredFacts.push({ type: 'candidate_surname', value: facts.surname, confidence: aiAnalysis.confidence || 'low' });
  if (facts.place) discoveredFacts.push({ type: 'candidate_place', value: facts.place, confidence: aiAnalysis.confidence || 'low' });
  if (facts.year) discoveredFacts.push({ type: 'candidate_year', value: facts.year, confidence: aiAnalysis.confidence || 'low' });
  for (const relative of facts.relatives) discoveredFacts.push({ type: 'candidate_relative', value: relative, confidence: aiAnalysis.confidence || 'low' });

  const enrichedSearch = {
    ...targetSearch,
    surname: targetSearch.surname || facts.surname || '',
    place: facts.place || targetSearch.place,
    birthYear: targetSearch.birthYear || (facts.year ? Number(facts.year) : undefined)
  };

  return {
    enrichedSearch,
    discoveredFacts,
    candidateQueries: buildCandidateQueries(targetSearch, facts),
    confidence: aiAnalysis.confidence || 'low',
    reasoning: aiAnalysis.reasoning || 'Enriquecimento calculado a partir de resultados de parentes.'
  };
}

module.exports = {
  enrichWeakPersonWithRelativeResults
};
