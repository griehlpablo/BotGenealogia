function safeLower(value) {
  return String(value || '').toLowerCase();
}

function textContains(text, fragment) {
  return safeLower(text).includes(safeLower(fragment));
}

const COMMON_GIVEN_NAMES = new Set(['maria', 'jose', 'josÃ©', 'joao', 'joÃ£o', 'anna', 'ana', 'pedro', 'mads', 'hans', 'else', 'mrs']);
const BROAD_PLACES = new Set(['brasil', 'brazil', 'dinamarca', 'denmark', 'italia', 'itÃ¡lia', 'italy', 'portugal', 'espanha', 'spain', 'france', 'franca', 'franÃ§a', 'germany', 'alemanha']);

function scoreNameMatch(text, search) {
  let score = 0;
  if (search.surname && textContains(text, search.surname)) score += 30;
  if (search.givenName && textContains(text, search.givenName)) {
    score += (!search.surname && COMMON_GIVEN_NAMES.has(safeLower(search.givenName))) ? 5 : 20;
  }
  if (search.father && textContains(text, search.father)) score += 10;
  if (search.mother && textContains(text, search.mother)) score += 10;
  if (search.spouse && textContains(text, search.spouse)) score += 10;
  return score;
}

function scorePlaceMatch(text, search) {
  if (!search.place) return 0;
  if (!textContains(text, search.place)) return 0;
  return BROAD_PLACES.has(safeLower(search.place)) ? 5 : 15;
}

function scoreYearMatch(text, search, birthWindow) {
  let score = 0;
  if (search.birthYear && textContains(text, String(search.birthYear))) score += 15;
  if (birthWindow && birthWindow.from && birthWindow.to) {
    for (let year = birthWindow.from; year <= birthWindow.to; year += 1) {
      if (textContains(text, String(year))) {
        score += 10;
        break;
      }
    }
  }
  return score;
}

function incompatibleYearPenalty(text, birthWindow) {
  if (!birthWindow?.from || !birthWindow?.to) return 0;
  const years = [...new Set((String(text || '').match(/\b(1[4-9]\d{2}|20\d{2})\b/g) || []).map(Number))];
  return years.some((year) => year < birthWindow.from - 5 || year > birthWindow.to + 5) ? 35 : 0;
}

function scoreSourceType(type) {
  if (['familysearch', 'myheritage', 'geneanet', 'findagrave', 'billiongraves'].includes(type)) return 15;
  if (['cemetery', 'civil_registry', 'church_record', 'newspaper', 'public_archive', 'genealogy_tree'].includes(type)) return 10;
  return 5;
}

function scoreObjective(pageData, search, birthWindow, sourceType) {
  const text = [pageData.title, pageData.snippet, pageData.rawText].join(' ');
  let score = 0;
  score += scoreNameMatch(text, search);
  score += scorePlaceMatch(text, search);
  score += scoreYearMatch(text, search, birthWindow);
  score += scoreSourceType(sourceType);
  score -= incompatibleYearPenalty(text, birthWindow);
  if (!pageData.snippet) score -= 5;
  if (!pageData.rawText) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function hasStrongEvidence(text, search, birthWindow) {
  if (search.surname && textContains(text, search.surname)) return true;
  if (search.father && textContains(text, search.father)) return true;
  if (search.mother && textContains(text, search.mother)) return true;
  if (search.spouse && textContains(text, search.spouse)) return true;
  if (search.birthYear && textContains(text, String(search.birthYear))) return true;
  if (birthWindow?.from && birthWindow?.to) {
    for (let year = birthWindow.from; year <= birthWindow.to; year += 1) {
      if (textContains(text, String(year))) return true;
    }
  }
  return false;
}

function confidenceHint(score, text, search, birthWindow) {
  if (!hasStrongEvidence(text, search, birthWindow)) return 'low';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function scoreWebResult(pageData, search, birthWindow, sourceType) {
  const objectiveScore = scoreObjective(pageData, search, birthWindow, sourceType);
  const reasons = [];
  const penalties = [];
  const text = [pageData.title, pageData.snippet, pageData.rawText].join(' ');

  if (search.surname && textContains(text, search.surname)) reasons.push('Sobrenome identificado no conteudo.');
  if (search.givenName && textContains(text, search.givenName)) reasons.push('Nome próprio identificado no conteudo.');
  if (search.place && textContains(text, search.place)) reasons.push('Local compatível encontrado.');
  if (search.birthYear && textContains(text, String(search.birthYear))) reasons.push('Ano de nascimento potencial encontrado.');
  if (sourceType && sourceType !== 'generic_web') reasons.push(`Fonte classe ${sourceType}.`);

  if (incompatibleYearPenalty(text, birthWindow)) penalties.push('Ano incompatível detectado no conteudo.');
  if (!hasStrongEvidence(text, search, birthWindow)) penalties.push('Sem sobrenome, parente ou ano compativel suficiente.');
  if (!pageData.rawText) penalties.push('Pagina sem texto bruto coletado.');
  if (!pageData.snippet) penalties.push('Resultado de busca sem snippet.');

  return {
    objectiveScore,
    confidenceHint: confidenceHint(objectiveScore, text, search, birthWindow),
    reasons,
    penalties
  };
}

module.exports = {
  scoreWebResult
};
