const { generateQueries, isQueryTooGeneric } = require('../src/queryGenerator');

const sample = {
  id: 'maria-denmark-1865',
  givenName: 'Maria',
  surname: '',
  place: 'Dinamarca',
  birthYear: 1865,
  reason: 'Mãe de Peter Andersen',
  father: '',
  mother: '',
  spouse: '',
  children: []
};

const queries = generateQueries(sample);
console.log('Queries geradas para Maria/Dinamarca:');

for (const query of queries) {
  const check = query.skipWeb ? { tooGeneric: true, reasons: [query.reason] } : isQueryTooGeneric(query, sample);
  console.log(JSON.stringify({
    query: query.query,
    purpose: query.purpose,
    priority: query.priority,
    skipWeb: Boolean(query.skipWeb),
    reason: query.reason || '',
    tooGeneric: check.tooGeneric,
    reasons: check.reasons
  }, null, 2));
}

const badQuery = queries.some((query) => query.query.toLowerCase() === 'maria dinamarca');
const contextualQuery = queries.some((query) => /Peter Andersen|Andersen/.test(query.query));

if (badQuery) {
  console.error('Falha: gerou query proibida "maria Dinamarca".');
  process.exitCode = 1;
}

if (!contextualQuery && !queries.some((query) => query.skipWeb)) {
  console.error('Falha: nao gerou contexto com Peter Andersen/Andersen nem marcou skipWeb.');
  process.exitCode = 1;
}
