const { extractGenericResults } = require('./generic');

async function extractFamilySearchResults(page, limit) {
  return extractGenericResults(page, limit);
}

module.exports = {
  extractFamilySearchResults
};
