const { generateQueries } = require('../src/queryGenerator');

const sample = {
  id: 'sample-1',
  givenName: 'Pedro',
  surname: 'Tramontini',
  birthYear: 1888,
  place: 'Brasil',
  father: 'Justina Savi',
  mother: '',
  spouse: '',
  children: [],
  variants: []
};

const queries = generateQueries(sample);
console.log('Queries geradas para amostra:');
queries.forEach((query, index) => {
  console.log(`${index + 1}. [${query.priority}] ${query.purpose} -> ${query.query}`);
});
