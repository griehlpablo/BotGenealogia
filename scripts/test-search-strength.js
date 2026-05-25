const { analyzeSearchStrength } = require('../src/searchStrength');

const cases = [
  {
    label: 'Maria fraca',
    search: { givenName: 'Maria', surname: '', place: 'Dinamarca', birthYear: 1865, reason: 'Mãe de Peter Andersen' },
    level: 'weak',
    strategy: 'search_relatives_first'
  },
  {
    label: 'Pedro forte',
    search: { givenName: 'Pedro', surname: 'Tramontini', place: 'Brasil', birthYear: 1888, spouse: 'Justina Savi' },
    level: 'strong',
    strategy: 'direct_search'
  },
  {
    label: 'Mrs skip',
    search: { givenName: 'Mrs.', surname: 'Soren', place: 'Dinamarca' },
    level: 'skip',
    strategy: 'manual_only'
  }
];

let failed = false;
for (const item of cases) {
  const result = analyzeSearchStrength(item.search);
  console.log(`${item.label}:`, JSON.stringify(result, null, 2));
  if (result.level !== item.level || result.recommendedStrategy !== item.strategy) {
    console.error(`Falha em ${item.label}: esperado ${item.level}/${item.strategy}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
