function toSortedYears(years = []) {
  return years
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function clampRange(range, minYear = 1400, maxYear = new Date().getFullYear()) {
  return {
    from: Math.max(minYear, Math.floor(range.from)),
    to: Math.min(maxYear, Math.ceil(range.to))
  };
}

function deduceMotherBirthWindow({
  childrenBirthYears = [],
  minMotherAge = 16,
  maxMotherAge = 45,
  spouseBirthYear,
  minSpouseAgeDifference = -60,
  maxSpouseAgeDifference = 25
} = {}) {
  const years = toSortedYears(childrenBirthYears);
  if (years.length === 0) return null;

  const firstChildYear = years[0];
  const lastChildYear = years[years.length - 1];
  let from = lastChildYear - maxMotherAge;
  let to = firstChildYear - minMotherAge;

  if (Number.isFinite(Number(spouseBirthYear))) {
    const spouseYear = Number(spouseBirthYear);
    from = Math.max(from, spouseYear - maxSpouseAgeDifference);
    to = Math.min(to, spouseYear - minSpouseAgeDifference);
  }

  return clampRange({ from, to });
}

function deduceBirthWindow(person = {}) {
  if (person.birthYearRange) {
    return clampRange(person.birthYearRange);
  }

  if (Number.isFinite(Number(person.birthYear))) {
    const year = Number(person.birthYear);
    const tolerance = Number.isFinite(Number(person.birthYearTolerance))
      ? Number(person.birthYearTolerance)
      : 2;
    return clampRange({ from: year - tolerance, to: year + tolerance });
  }

  return deduceMotherBirthWindow({
    childrenBirthYears: person.childrenBirthYears,
    spouseBirthYear: person.knownSpouseBirthYear,
    minMotherAge: person.minMotherAge,
    maxMotherAge: person.maxMotherAge
  });
}

function formatYearRange(range) {
  if (!range) return '';
  return `${range.from}-${range.to}`;
}

module.exports = {
  deduceBirthWindow,
  deduceMotherBirthWindow,
  formatYearRange
};
