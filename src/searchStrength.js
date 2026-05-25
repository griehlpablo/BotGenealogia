const COMMON_NAMES = new Set(['maria', 'josÃ©', 'jose', 'joÃ£o', 'joao', 'anna', 'ana', 'hans', 'mads', 'else', 'mrs']);
const BROAD_PLACES = new Set(['dinamarca', 'denmark', 'brasil', 'brazil', 'itÃ¡lia', 'italia', 'italy', 'espanha', 'spain', 'portugal', 'france', 'franÃ§a', 'franca', 'germany', 'alemanha']);

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function isBroadPlace(place) {
  const normalized = lower(place);
  if (!normalized) return false;
  if (BROAD_PLACES.has(normalized)) return true;
  return !/[,\-]/.test(place) && normalized.split(/\s+/).length <= 2;
}

function reasonNames(reason) {
  return text(reason).match(/\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+/gu) || [];
}

function hasChildren(search) {
  return (Array.isArray(search.children) && search.children.length > 0)
    || reasonNames(search.reason).length > 0
    || (Array.isArray(search.childrenBirthYears) && search.childrenBirthYears.length > 0);
}

function analyzeSearchStrength(search = {}) {
  let score = 0;
  const reasons = [];
  const missing = [];

  const givenName = text(search.givenName);
  const surname = text(search.surname);
  const place = text(search.place);
  const commonGiven = COMMON_NAMES.has(lower(givenName));
  const broadPlace = isBroadPlace(place);
  const hasParent = Boolean(text(search.father) || text(search.mother));
  const hasSpouse = Boolean(text(search.spouse));
  const children = hasChildren(search);
  const namesInReason = reasonNames(search.reason);

  if (givenName && surname) {
    score += 30;
    reasons.push('Tem nome e sobrenome.');
  } else {
    missing.push('surname');
  }

  if (search.birthYear || search.deathYear) {
    score += 20;
    reasons.push('Tem ano de nascimento ou obito.');
  } else {
    missing.push('birth_or_death_year');
  }

  if (place && !broadPlace) {
    score += 15;
    reasons.push('Tem local especifico.');
  } else if (!place) {
    missing.push('specific_place');
  }

  if (hasSpouse) {
    score += 20;
    reasons.push('Tem conjuge.');
  }

  if (hasParent) {
    score += 20;
    reasons.push('Tem pai ou mae.');
  }

  if (children) {
    score += 20;
    reasons.push('Tem filhos ou nomes extraidos do contexto.');
  }

  if (namesInReason.length > 0) {
    score += 15;
    reasons.push('Reason contem nome completo de parente.');
  }

  if (commonGiven && !surname) {
    score -= 40;
    reasons.push('Nome comum sem sobrenome.');
  }

  if (broadPlace && !surname) {
    score -= 30;
    reasons.push('Local amplo, provavelmente pais.');
  }

  if (!surname && !hasParent && !hasSpouse && !children && !place) {
    score -= 30;
    reasons.push('Sem sobrenome, parente nem cidade.');
  }

  if (commonGiven) {
    score -= 20;
    reasons.push('Nome generico.');
  }

  if (score < 15 && !surname && search.birthYear && children) {
    score = 15;
    reasons.push('Contexto minimo preservado por ano e parente citado.');
  }

  if (score < 15 && !surname && search.birthYear && givenName && commonGiven) {
    score = 15;
    reasons.push('Contexto minimo preservado por ano, mas busca direta continua insegura.');
  }

  score = Math.max(0, Math.min(100, score));
  let level = 'skip';
  if (score >= 65) level = 'strong';
  else if (score >= 40) level = 'medium';
  else if (score >= 15) level = 'weak';

  let recommendedStrategy = 'manual_only';
  if (level === 'strong' || level === 'medium') recommendedStrategy = 'direct_search';
  if (level === 'weak') recommendedStrategy = 'search_relatives_first';

  return {
    level,
    score,
    reasons,
    missing: [...new Set(missing)],
    recommendedStrategy
  };
}

module.exports = {
  analyzeSearchStrength,
  isBroadPlace,
  COMMON_NAMES
};
