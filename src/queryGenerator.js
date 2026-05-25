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

const COMMON_GIVEN_NAMES = new Set([
  'maria',
  'jose',
  'josÃ©',
  'joao',
  'joÃ£o',
  'anna',
  'ana',
  'pedro',
  'mads',
  'hans',
  'else',
  'mrs'
]);

const BROAD_PLACES = new Set([
  'brasil',
  'brazil',
  'dinamarca',
  'denmark',
  'italia',
  'itÃ¡lia',
  'italy',
  'portugal',
  'espanha',
  'spain',
  'alemanha',
  'germany',
  'franca',
  'franÃ§a',
  'france',
  'argentina',
  'uruguay',
  'paraguay',
  'poland',
  'polonia',
  'polÃ´nia'
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeForMatch(value) {
  return normalizeText(value).toLowerCase();
}

function quote(value) {
  const text = normalizeText(value);
  return text ? `"${text}"` : '';
}

function webPlace(value) {
  const text = normalizeText(value);
  const map = {
    dinamarca: 'Denmark',
    'itÃ¡lia': 'Italy',
    italia: 'Italy',
    espanha: 'Spain',
    brasil: 'Brazil'
  };
  return map[normalizeForMatch(text)] || text;
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
  for (const child of normalizePeopleList(search.children)) {
    variants.add(`${given} ${family} ${child}`.trim());
  }

  return Array.from(variants).filter(Boolean);
}

function normalizePeopleList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      if (typeof item === 'string') return normalizeText(item);
      if (item && typeof item === 'object') {
        return [item.givenName, item.surname, item.name].filter(Boolean).join(' ').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function extractNamesFromReason(reason) {
  const text = normalizeText(reason);
  if (!text) return [];
  const names = [];
  const matches = text.match(/\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+/gu) || [];
  for (const match of matches) {
    const cleaned = match.replace(/^(Mae|MÃ£e|Pai|Filho|Filha|Conjuge|CÃ´njuge)\s+de\s+/i, '').trim();
    if (cleaned) names.push(cleaned);
  }
  return [...new Set(names)];
}

function buildContext(search, externalContext = {}) {
  const relatives = [
    normalizeText(search.father),
    normalizeText(search.mother),
    normalizeText(search.spouse),
    ...normalizePeopleList(search.children),
    ...extractNamesFromReason(search.reason)
  ].filter(Boolean);

  const surnames = new Set();
  for (const relative of relatives) {
    const pieces = relative.split(/\s+/).filter(Boolean);
    if (pieces.length > 1) surnames.add(pieces[pieces.length - 1]);
  }

  const externalRelatives = (externalContext.relatives || [])
    .map((relative) => relative.name || [relative.search?.givenName, relative.search?.surname].filter(Boolean).join(' '))
    .filter(Boolean);
  for (const relative of externalRelatives) {
    relatives.push(relative);
    const pieces = relative.split(/\s+/).filter(Boolean);
    if (pieces.length > 1) surnames.add(pieces[pieces.length - 1]);
  }
  for (const surname of externalContext.candidateSurnames || []) surnames.add(surname);

  return {
    relatives: [...new Set(relatives)],
    relativeSurnames: [...surnames],
    discoveredFacts: externalContext.discoveredFacts || [],
    strategy: externalContext.strategy || 'direct_search'
  };
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

function usefulTokens(query) {
  return normalizeForMatch(query)
    .replace(/["']/g, ' ')
    .split(/[^a-zÃ -Ã¿0-9]+/i)
    .filter((token) => token.length > 1);
}

function hasParentContext(search, query = '', externalContext = {}) {
  const text = normalizeForMatch(query);
  const context = buildContext(search, externalContext);
  if (context.relatives.length > 0) return true;
  if (search.reason && text && usefulTokens(search.reason).some((token) => text.includes(token))) return true;
  if (Array.isArray(search.childrenBirthYears) && search.childrenBirthYears.length > 0) return true;
  return false;
}

function isBroadPlace(place) {
  const normalized = normalizeForMatch(place);
  if (!normalized) return false;
  if (BROAD_PLACES.has(normalized)) return true;
  return !/[,\-]/.test(place) && normalized.split(/\s+/).length <= 2;
}

function isQueryTooGeneric(queryObject, search = {}, externalContext = {}) {
  const query = normalizeText(queryObject?.query || queryObject);
  const reasons = [];
  const tokens = usefulTokens(query);
  const given = normalizeForMatch(search.givenName);
  const surname = normalizeText(search.surname);
  const place = normalizeText(search.place);
  const lowerQuery = normalizeForMatch(query);
  const commonGiven = COMMON_GIVEN_NAMES.has(given);
  const hasSurname = Boolean(surname) && lowerQuery.includes(normalizeForMatch(surname));
  const context = buildContext(search, externalContext);
  const hasRelative = context.relatives.some((relative) => lowerQuery.includes(normalizeForMatch(relative)))
    || context.relativeSurnames.some((relativeSurname) => lowerQuery.includes(normalizeForMatch(relativeSurname)));
  const hasYear = /\b(1[4-9]\d{2}|20\d{2})\b/.test(query);
  const hasCityLikePlace = Boolean(place) && !isBroadPlace(place);
  const onlyGivenAndCountry = given
    && place
    && isBroadPlace(place)
    && tokens.length <= 2
    && tokens.includes(given)
    && tokens.includes(normalizeForMatch(place));

  if (tokens.length < 3) reasons.push('Query tem menos de 3 tokens uteis.');
  if (commonGiven && !hasSurname && !hasRelative) reasons.push('Nome comum sem sobrenome ou parente.');
  if (onlyGivenAndCountry) reasons.push('Query contem apenas nome proprio e pais.');
  if (!hasYear && !hasSurname && !hasRelative && !hasCityLikePlace) {
    reasons.push('Query sem ano, sobrenome, parente ou cidade.');
  }

  return {
    tooGeneric: reasons.length > 0,
    reasons
  };
}

function generateQueries(search = {}, externalContext = {}) {
  const givenName = normalizeText(search.givenName);
  const surname = normalizeText(search.surname);
  const place = normalizeText(search.place);
  const birthYear = search.birthYear || (search.birthYearRange && search.birthYearRange.from);
  const deathYear = search.deathYear;
  const coreName = buildBaseName(search);
  const variants = buildNameVariants(search);
  const context = buildContext(search, externalContext);
  const targetSites = ['google', 'bing', 'duckduckgo'];
  const queries = [];

  if (!coreName) {
    return [];
  }

  const hasSurname = Boolean(surname);
  const hasPlace = Boolean(place);
  const hasYear = Boolean(birthYear || deathYear);
  const highConfidence = hasSurname && givenName;
  const broadPlaceOnly = givenName && !hasSurname && hasPlace && isBroadPlace(place) && !hasParentContext(search, '', externalContext);

  if (broadPlaceOnly) {
    return [{
      query: '',
      purpose: 'skip_generic_query',
      priority: 99,
      targetSites,
      personId: search.id,
      skipWeb: true,
      reason: 'Nome muito generico sem sobrenome ou parentes suficientes.'
    }];
  }

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

  if (!hasSurname && givenName && context.relatives.length > 0) {
    const year = birthYear ? String(birthYear) : '';
    const firstRelative = context.relatives[0];
    const firstRelativeSurname = context.relativeSurnames[0];
    addUnique(queries, buildQueryTemplate(quote(givenName), [quote(firstRelative), webPlace(place), year], 1, 'given_relative_place_year', targetSites, search.id));
    if (context.relatives.length > 1) {
      addUnique(queries, buildQueryTemplate(quote(givenName), [quote(context.relatives[0]), quote(context.relatives[1]), webPlace(place)], 1, 'given_multiple_relatives_place', targetSites, search.id));
    }
    if (firstRelativeSurname) {
      addUnique(queries, buildQueryTemplate(quote(givenName), [firstRelativeSurname, webPlace(place), year], 2, 'given_relative_surname_place_year', targetSites, search.id));
      addUnique(queries, buildQueryTemplate(quote(givenName), [firstRelativeSurname, 'genealogy'], 2, 'given_candidate_surname_genealogy', targetSites, search.id));
      addUnique(queries, buildQueryTemplate(quote(givenName), [firstRelativeSurname, 'FamilySearch'], 2, 'given_candidate_surname_familysearch', targetSites, search.id));
      addUnique(queries, buildQueryTemplate(quote(givenName), [firstRelativeSurname, 'Geneanet'], 2, 'given_candidate_surname_geneanet', targetSites, search.id));
    }
  }

  if (externalContext.strategy === 'enriched_target_search') {
    for (const candidate of externalContext.candidateQueries || []) {
      addUnique(queries, buildQueryTemplate(candidate, [], 1, 'enriched_candidate_query', targetSites, search.id));
    }
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
    const genericCheck = isQueryTooGeneric(query, search, externalContext);
    if (genericCheck.tooGeneric) {
      filtered.push({
        ...query,
        query: '',
        originalQuery: query.query,
        skipWeb: true,
        reason: genericCheck.reasons.join(' ')
      });
      continue;
    }
    if (seen.has(query.query.toLowerCase())) continue;
    seen.add(query.query.toLowerCase());
    filtered.push(query);
  }

  return filtered.sort((a, b) => a.priority - b.priority);
}

module.exports = {
  generateQueries,
  isQueryTooGeneric
};
