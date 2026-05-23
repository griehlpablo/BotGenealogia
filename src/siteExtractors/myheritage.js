const { extractGenericResults } = require('./generic');

async function extractMyHeritageResults(page, limit) {
  return extractGenericResults(page, limit);
}

module.exports = {
  extractMyHeritageResults
};
