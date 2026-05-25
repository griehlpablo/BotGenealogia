const { analyzeSearchStrength } = require('./searchStrength');
const { buildFamilyContext } = require('./familyContext');

function createResearchPlan(search, allSearches = []) {
  const targetStrength = analyzeSearchStrength(search);
  const familyContext = buildFamilyContext(search, allSearches);
  const steps = [];
  let strategy = targetStrength.recommendedStrategy;

  if (targetStrength.level === 'strong') {
    steps.push({ type: 'search_target', search, reason: 'Pessoa forte para busca direta.', priority: 1 });
    if ((search.site || 'familysearch') === 'familysearch') {
      steps.push({ type: 'manual_familysearch', search, reason: 'FamilySearch permanece manual.', priority: 2 });
    }
  } else if (targetStrength.level === 'medium') {
    steps.push({ type: 'search_target', search, reason: 'Pessoa media: tentar busca direta em camadas.', priority: 1 });
    for (const relative of familyContext.relatives.slice(0, 2)) {
      steps.push({ type: 'search_relative', search: relative.search, relative, reason: `Fallback com parente: ${relative.name}.`, priority: 2 });
    }
  } else if (targetStrength.level === 'weak') {
    strategy = 'search_relatives_first';
    for (const relative of familyContext.relatives.slice(0, 2)) {
      steps.push({ type: 'search_relative', search: relative.search, relative, reason: `Fortalecer alvo pesquisando ${relative.name}.`, priority: 1 });
    }
    steps.push({ type: 'search_target_enriched', search, reason: 'Tentar alvo apenas com contexto reforcado.', priority: 2 });
    steps.push({ type: 'manual_familysearch', search, reason: 'Fallback manual para contexto fraco.', priority: 3 });
  } else {
    strategy = 'manual_only';
    steps.push({ type: 'manual_familysearch', search, reason: 'Pessoa fraca demais para web geral.', priority: 1 });
    steps.push({ type: 'skip', search, reason: 'Busca web direta evitada.', priority: 2 });
  }

  return {
    target: search,
    targetStrength,
    familyContext,
    strategy,
    steps: steps.slice(0, 4)
  };
}

module.exports = {
  createResearchPlan
};
