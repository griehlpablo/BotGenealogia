const { createResearchPlan } = require('../src/researchPlanner');
const { normalizeResultStatus } = require('../src/resultStatus');
const { getNextSearchesForRun } = require('../src/progressStore');

const searches = [
  { id: 'maria', givenName: 'Maria', surname: '', place: 'Dinamarca', birthYear: 1865, reason: 'Falta o sobrenome de solteira, data de obito e identificacao dos pais.' },
  { id: 'mrs-soren', givenName: 'Mrs.', surname: 'Soren', place: 'Dinamarca' },
  { id: 'pedro', givenName: 'Pedro', surname: 'Tramontini', place: 'Brasil', birthYear: 1888, spouse: 'Justina Savi' },
  { id: 'lorenzo', givenName: 'Lorenzo', surname: 'Tramontini', place: 'Brasil', birthYear: 1860 }
];

async function main() {
  const queue = await getNextSearchesForRun(searches, 'test', {
    maxPeople: 5,
    maxAttempts: 10,
    continueOnSkip: true,
    now: new Date('2026-05-25T00:00:00.000Z'),
    progress: { people: {}, cursorBySource: {}, activePlans: [] },
    skipWrite: true
  });

  const plans = queue.searches.map((item) => ({ item, plan: createResearchPlan(item.search, searches) }));
  const maria = plans.find((entry) => entry.item.search.id === 'maria');
  const mrs = plans.find((entry) => entry.item.search.id === 'mrs-soren');
  const pedro = plans.find((entry) => entry.item.search.id === 'pedro');

  const mariaStatus = normalizeResultStatus({ pageState: 'weak_context_manual_required' });
  const mrsStatus = normalizeResultStatus({ pageState: 'no_queries' });

  console.log(JSON.stringify({
    selected: queue.searches.map((item) => item.search.id),
    mariaStrategy: maria.plan.strategy,
    mariaStatus,
    mrsStrategy: mrs.plan.strategy,
    mrsStatus,
    pedroStrategy: pedro.plan.strategy
  }, null, 2));

  let failed = false;
  if (mariaStatus !== 'weak_context') {
    console.error('Falha: Maria deveria receber weak_context.');
    failed = true;
  }
  if (!['skipped_generic', 'manual_required'].includes(mrsStatus)) {
    console.error('Falha: Mrs. Soren deveria ser skipped_generic ou manual_required.');
    failed = true;
  }
  if (!pedro || pedro.plan.strategy !== 'direct_search') {
    console.error('Falha: Pedro deveria entrar como candidato pesquisavel.');
    failed = true;
  }
  if (queue.searches.findIndex((item) => item.search.id === 'pedro') < 0) {
    console.error('Falha: fila nao chegou em Pedro.');
    failed = true;
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
