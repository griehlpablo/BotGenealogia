const {
  getNextSearchesForRun,
  updatePersonProgress
} = require('../src/progressStore');

const source = 'pdf';
const now = new Date('2026-05-25T12:00:00.000Z');
const searches = [
  { id: 'maria', givenName: 'Maria', surname: '', place: 'Dinamarca', birthYear: 1865 },
  { id: 'pedro', givenName: 'Pedro', surname: 'Tramontini', place: 'Brasil', birthYear: 1888 },
  { id: 'lorenzo', givenName: 'Lorenzo', surname: 'Tramontini', place: 'Brasil', birthYear: 1860 }
];

function assert(condition, message) {
  if (!condition) {
    console.error(`Falha: ${message}`);
    process.exitCode = 1;
  }
}

async function main() {
  const progress = { people: {}, cursorBySource: {}, activePlans: [] };

  await updatePersonProgress({
    progress,
    skipWrite: true,
    search: searches[0],
    source,
    status: 'weak_context',
    now,
    result: {
      pageState: 'weak_context_manual_required',
      error: 'Contexto fraco.'
    }
  });

  let next = await getNextSearchesForRun(searches, source, {
    progress,
    skipWrite: true,
    now,
    maxAttempts: 3
  });

  assert(next.searches[0]?.search.id === 'pedro', 'proxima pessoa deveria ser Pedro apos Maria weak_context.');

  await updatePersonProgress({
    progress,
    skipWrite: true,
    search: searches[1],
    source,
    status: 'found',
    now,
    result: {
      pageState: 'results_found',
      error: ''
    }
  });

  next = await getNextSearchesForRun(searches, source, {
    progress,
    skipWrite: true,
    now,
    maxAttempts: 3
  });

  assert(next.searches[0]?.search.id === 'lorenzo', 'proxima pessoa deveria ser Lorenzo apos Pedro found.');
  assert(!next.searches.some((item) => item.search.id === 'maria'), 'Maria nao deve voltar antes do retryAfter.');

  console.log(JSON.stringify({
    people: progress.people,
    cursorBySource: progress.cursorBySource,
    next: next.searches.map((item) => item.search.id),
    skipped: next.skipped.map((item) => ({ id: item.search.id, retryAfter: item.retryAfter }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
