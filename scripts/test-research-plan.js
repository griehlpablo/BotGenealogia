const { createResearchPlan } = require('../src/researchPlanner');
const { generateQueries } = require('../src/queryGenerator');

const maria = {
  id: 'maria-denmark',
  givenName: 'Maria',
  surname: '',
  place: 'Dinamarca',
  birthYear: 1865,
  reason: 'Mãe de Peter Andersen, casada com Hans Andersen'
};

const plan = createResearchPlan(maria, []);
console.log(JSON.stringify(plan, null, 2));

const stepNames = plan.steps.map((step) => [step.search?.givenName, step.search?.surname].filter(Boolean).join(' '));
const queries = generateQueries(maria, {
  strategy: 'enriched_target_search',
  relatives: plan.familyContext.relatives,
  candidateSurnames: plan.familyContext.candidateSurnames
});

const queryText = queries.map((query) => query.query).join('\n').toLowerCase();
let failed = false;

if (plan.strategy !== 'search_relatives_first') {
  console.error('Falha: Maria deveria usar search_relatives_first.');
  failed = true;
}
if (!stepNames.some((name) => /Peter Andersen/i.test(name))) {
  console.error('Falha: plano nao busca Peter Andersen.');
  failed = true;
}
if (!stepNames.some((name) => /Hans Andersen/i.test(name))) {
  console.error('Falha: plano nao busca Hans Andersen.');
  failed = true;
}
if (queryText.includes('maria dinamarca')) {
  console.error('Falha: query generica maria Dinamarca foi gerada.');
  failed = true;
}

console.log('Queries enriquecidas:');
queries.forEach((query) => console.log(`${query.skipWeb ? 'SKIP' : 'OK'} ${query.query || query.originalQuery || ''}`));

if (failed) process.exitCode = 1;
