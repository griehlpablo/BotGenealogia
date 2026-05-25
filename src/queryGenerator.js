const NAME_VARIANTS = {
  pedro: ['pietro'],
  josé: ['giuseppe', 'jose'],
  jose: ['giuseppe'],
  joão: ['giovanni', 'joao'],
  joao: ['giovanni'],
  maria: ['maria']
};

const SEARCH_TERMS = [
  'óbito',
  'obituário',
  'cemitério',
  'registro civil',
  'registro de nascimento',
  'registro de óbito',
  'histórico familiar',
  'grave',
  'túmulo',
  'geneanet',
  'find a grave',
  'billiongraves',
  'familysearch',
  'myheritage'
];

function normalizeText(value) {
  return String(value || '').trim();
}

function buildBaseName(search) {
  const given = normalizeText(search.givenName);
  const family = normalizeText(search.surname);
  if (given && family) return `${given} ${family}`;
  if (family) return family;
  return given;
}

function buildNameVariants(search) {
  const variants = new Set();
  const baseName = buildBaseName(search);
  if (baseName) variants.add(baseName);

  const given = normalizeText(search.givenName);
  const family = normalizeText(search.surname);

  if (given && NAME_VARIANTS[given.toLowerCase()]) {
    for (const variantGiven of NAME_VARIANTS[given.toLowerCase()]) {
      variants.add(`${variantGiven} ${family}`.trim());
    }
  }

  if (Array.isArray(search.variants)) {
    for (const variant of search.variants) {
      const candidate = normalizeText(variant);
      if (candidate) variants.add(candidate);
    }
  }

  if (search.father) {
    variants.add(`${given} ${family} ${normalizeText(search.father)}`.trim());
  }
  if (search.mother) {
    variants.add(`${given} ${family} ${normalizeText(search.mother)}`.trim());
  }
  if (search.spouse) {
    variants.add(`${given} ${family} ${normalizeText(search.spouse)}`.trim());
  }

  return Array.from(variants).filter(Boolean);
}

function addUnique(arr, item) {
  if (!arr.includes(item)) arr.push(item);
}

function buildQueryTemplate(base, fragments, priority, purpose, targetSites, personId) {
  return {
    query: [base, ...fragments].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    purpose,
    priority,
    targetSites,
    personId
  };
}

function generateQueries(search = {}) {
  const givenName = normalizeText(search.givenName);
  const surname = normalizeText(search.surname);
  const place = normalizeText(search.place);
  const birthYear = search.birthYear || (search.birthYearRange && search.birthYearRange.from);
  const deathYear = search.deathYear;
  const coreName = buildBaseName(search);
  const variants = buildNameVariants(search);
  const targetSites = ['google', 'bing', 'duckduckgo'];
  const queries = [];

  if (!coreName) {
    return [];
  }

  const hasSurname = Boolean(surname);
  const hasPlace = Boolean(place);
  const hasYear = Boolean(birthYear || deathYear);
  const highConfidence = hasSurname && givenName;

  const extraTerms = [];
  if (hasPlace) extraTerms.push(place);
  if (birthYear) extraTerms.push(String(birthYear));

  if (highConfidence) {
    addUnique(queries, buildQueryTemplate(coreName, [place], 1, 'full_name_place', targetSites, search.id));
    if (birthYear) addUnique(queries, buildQueryTemplate(coreName, [String(birthYear)], 1, 'full_name_year', targetSites, search.id));
    if (deathYear) addUnique(queries, buildQueryTemplate(coreName, [String(deathYear), 'óbito'], 1, 'full_name_death', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['familysearch'], 2, 'familysearch', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['geneanet'], 2, 'geneanet', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['find a grave'], 2, 'findagrave', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['billiongraves'], 2, 'billiongraves', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['obituário'], 2, 'obituary', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['cemitério'], 2, 'cemetery', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['registro civil'], 2, 'civil_registry', targetSites, search.id));
    addUnique(queries, buildQueryTemplate(coreName, ['pai', 'mãe'], 2, 'parents', targetSites, search.id));
    if (search.spouse) addUnique(queries, buildQueryTemplate(coreName, ['cônjuge', normalizeText(search.spouse)], 2, 'spouse', targetSites, search.id));
  }

  for (const variant of variants) {
    if (variant === coreName) continue;
    addUnique(queries, buildQueryTemplate(variant, [place], 2, 'name_variant_place', targetSites, search.id));
  }

  if (!highConfidence && surname) {
    const fragments = [surname, place].filter(Boolean);
    addUnique(queries, buildQueryTemplate(fragments.join(' '), [], 3, 'surname_only', targetSites, search.id));
  }

  if (!hasPlace && hasYear && givenName) {
    addUnique(queries, buildQueryTemplate(coreName, [String(birthYear)], 3, 'year_only', targetSites, search.id));
  }

  const seen = new Set();
  const filtered = [];

  for (const query of queries) {
    if (!query.query || query.query.length < 5) continue;
    if (seen.has(query.query.toLowerCase())) continue;
    seen.add(query.query.toLowerCase());
    filtered.push(query);
  }

  return filtered.sort((a, b) => a.priority - b.priority);
}

module.exports = {
  generateQueries
};
