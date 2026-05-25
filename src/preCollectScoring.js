const COMMON_GIVEN_NAMES = new Set(['maria', 'jose', 'josÃ©', 'joao', 'joÃ£o', 'anna', 'ana', 'pedro', 'mads', 'hans', 'else', 'mrs']);
const GENEALOGY_TERMS = [
  'nascimento',
  'obito',
  'Ã³bito',
  'registro',
  'cemiterio',
  'cemitÃ©rio',
  'genealogy',
  'family tree',
  'ancestor',
  'record',
  'grave',
  'birth',
  'death'
];

function lower(value) {
  return String(value || '').toLowerCase();
}

function contains(text, value) {
  const fragment = lower(value);
  return Boolean(fragment) && text.includes(fragment);
}

function relativesFor(search) {
  const names = [search.father, search.mother, search.spouse].filter(Boolean);
  if (Array.isArray(search.children)) {
    for (const child of search.children) {
      if (typeof child === 'string') names.push(child);
      if (child && typeof child === 'object') names.push([child.givenName, child.surname, child.name].filter(Boolean).join(' '));
    }
  }
  const reasonNames = String(search.reason || '').match(/\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+/gu) || [];
  names.push(...reasonNames);
  return [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))];
}

function yearsNear(text, birthWindow) {
  if (!birthWindow?.from || !birthWindow?.to) return false;
  for (let year = birthWindow.from; year <= birthWindow.to; year += 1) {
    if (text.includes(String(year))) return true;
  }
  return false;
}

function incompatibleYears(text, birthWindow) {
  if (!birthWindow?.from || !birthWindow?.to) return [];
  const years = [...new Set((text.match(/\b(1[4-9]\d{2}|20\d{2})\b/g) || []).map(Number))];
  return years.filter((year) => year < birthWindow.from - 5 || year > birthWindow.to + 5);
}

function scorePreCollectResult(item, search, birthWindow, sourceType) {
  const text = lower([item.title, item.snippet, item.url].join(' '));
  const reasons = [];
  const penalties = [];
  let score = 0;

  const fullName = [search.givenName, search.surname].filter(Boolean).join(' ');
  const relatives = relativesFor(search);
  const commonGiven = COMMON_GIVEN_NAMES.has(lower(search.givenName));

  if (fullName && contains(text, fullName)) {
    score += 25;
    reasons.push('Nome completo aparece no resultado.');
  } else if (search.givenName && contains(text, search.givenName)) {
    score += commonGiven && !search.surname ? 5 : 10;
    reasons.push('Nome proprio aparece no resultado.');
  }

  if (search.surname && contains(text, search.surname)) {
    score += 25;
    reasons.push('Sobrenome aparece no resultado.');
  }

  if (search.birthYear && contains(text, String(search.birthYear))) {
    score += 20;
    reasons.push('Ano exato aparece no resultado.');
  } else if (yearsNear(text, birthWindow)) {
    score += 15;
    reasons.push('Ano compativel aparece no resultado.');
  }

  for (const relative of relatives) {
    if (contains(text, relative)) {
      score += 25;
      reasons.push(`Parente aparece no resultado: ${relative}.`);
      break;
    }
  }

  if (GENEALOGY_TERMS.some((term) => text.includes(term))) {
    score += 10;
    reasons.push('Termo genealogico aparece no resultado.');
  }

  if (sourceType === 'encyclopedia' || /wikip[eÃ©]dia|wikidata|wikipedia/.test(text)) {
    score -= 35;
    penalties.push('Resultado enciclopedico.');
  }

  if (/rainha|queen|king|rei|atriz|ator|politico|polÃ­tico|celebrity|celebridade/.test(text)) {
    score -= 25;
    penalties.push('Titulo sugere figura publica moderna.');
  }

  const incompatible = incompatibleYears(text, birthWindow);
  if (incompatible.length > 0) {
    score -= 35;
    penalties.push(`Ano incompatível detectado: ${incompatible.slice(0, 3).join(', ')}.`);
  }

  const hasStrongAnchor = Boolean(search.surname && contains(text, search.surname))
    || relatives.some((relative) => contains(text, relative))
    || Boolean(search.birthYear && contains(text, String(search.birthYear)))
    || yearsNear(text, birthWindow);

  if (!hasStrongAnchor) {
    score -= 20;
    penalties.push('Resultado sem sobrenome, parente ou ano compativel.');
  }

  return {
    preScore: Math.max(0, Math.min(100, score)),
    reasons,
    penalties
  };
}

module.exports = {
  scorePreCollectResult,
  relativesFor,
  incompatibleYears
};
