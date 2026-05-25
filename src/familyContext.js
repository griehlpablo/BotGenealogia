function clean(value) {
  return String(value || '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function makeNameSearch(name, base = {}) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  return {
    site: base.site || 'web',
    givenName: parts[0] || '',
    surname: parts.length > 1 ? parts.slice(1).join(' ') : '',
    place: base.place || '',
    birthYear: undefined,
    reason: `Parente usado para fortalecer busca de ${[base.givenName, base.surname].filter(Boolean).join(' ') || base.id || 'pessoa fraca'}`
  };
}

function extractNamesFromReason(reason) {
  const text = clean(reason);
  if (!text) return [];
  const patterns = [
    { relationHint: 'child', regex: /\b(?:m[ãa]e|mae|pai)\s+de\s+([^,;.]+)/giu },
    { relationHint: 'spouse', regex: /\b(?:casada|casado|esposa|marido|c[ôo]njuge)\s+(?:com|de)?\s*([^,;.]+)/giu },
    { relationHint: 'father_or_mother', regex: /\b(?:filha|filho)\s+de\s+([^,;.]+)/giu }
  ];
  const found = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const piece = clean(match[1]);
      const names = piece.split(/\s+e\s+/i);
      for (const name of names) {
        const candidate = clean(name.replace(/^(de|da|do)\s+/i, ''));
        if (/\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+/u.test(candidate)) {
          found.push({ name: candidate, relationHint: pattern.relationHint, confidence: 'medium' });
        }
      }
    }
  }

  const genericNames = text.match(/\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+/gu) || [];
  for (const name of genericNames) {
    if (!found.some((item) => lower(item.name) === lower(name))) {
      found.push({ name, relationHint: 'mentioned_in_reason', confidence: 'low' });
    }
  }

  return found;
}

function surnameOf(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function personLabel(search = {}) {
  return [search.givenName, search.surname].filter(Boolean).join(' ').trim() || search.id || '';
}

function buildFamilyContext(search = {}, allSearches = []) {
  const extractedNamesFromReason = extractNamesFromReason(search.reason);
  const relatives = [];
  const candidateSurnames = new Set();
  const candidatePlaces = new Set();
  const candidateYears = new Set();

  function addRelative(type, relativeSearch, name, confidence, reason) {
    if (!name) return;
    if (relatives.some((relative) => lower(relative.name) === lower(name) && relative.type === type)) return;
    relatives.push({ type, search: relativeSearch, name, confidence, reason });
    const surname = surnameOf(name);
    if (surname) candidateSurnames.add(surname);
    if (relativeSearch?.place) candidatePlaces.add(relativeSearch.place);
    if (relativeSearch?.birthYear) candidateYears.add(relativeSearch.birthYear);
  }

  if (search.spouse) addRelative('spouse', makeNameSearch(search.spouse, search), search.spouse, 'high', 'Conjuge informado no registro alvo.');
  if (search.father) addRelative('father', makeNameSearch(search.father, search), search.father, 'high', 'Pai informado no registro alvo.');
  if (search.mother) addRelative('mother', makeNameSearch(search.mother, search), search.mother, 'high', 'Mae informada no registro alvo.');
  if (Array.isArray(search.children)) {
    for (const child of search.children) {
      const name = typeof child === 'string' ? child : [child.givenName, child.surname, child.name].filter(Boolean).join(' ');
      addRelative('child', makeNameSearch(name, search), name, 'medium', 'Filho informado no registro alvo.');
    }
  }

  for (const item of extractedNamesFromReason) {
    const type = item.relationHint === 'father_or_mother' ? 'mentioned_in_reason' : item.relationHint;
    addRelative(type, makeNameSearch(item.name, search), item.name, item.confidence, `Nome extraido do reason: ${search.reason}`);
  }

  for (const other of allSearches || []) {
    if (other === search) continue;
    const label = personLabel(other);
    if (!label) continue;
    const mentioned = extractedNamesFromReason.some((item) => lower(item.name) === lower(label));
    const sharedSurname = search.surname && other.surname && lower(search.surname) === lower(other.surname);
    const samePlace = search.place && other.place && lower(search.place) === lower(other.place);
    if (mentioned) addRelative('nearby_tree_person', other, label, 'high', 'Pessoa encontrada em allSearches e citada no reason.');
    else if (sharedSurname && samePlace) addRelative('nearby_tree_person', other, label, 'medium', 'Sobrenome e local compartilhados em allSearches.');
  }

  if (search.place) candidatePlaces.add(search.place);
  if (search.birthYear) candidateYears.add(search.birthYear);
  if (Array.isArray(search.childrenBirthYears)) {
    for (const year of search.childrenBirthYears) candidateYears.add(year);
  }

  return {
    targetPerson: search,
    relatives,
    extractedNamesFromReason,
    candidateSurnames: [...candidateSurnames],
    candidatePlaces: [...candidatePlaces],
    candidateYears: [...candidateYears]
  };
}

module.exports = {
  buildFamilyContext,
  extractNamesFromReason
};
