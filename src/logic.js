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

function deduceFatherBirthWindow({
  childrenBirthYears = [],
  minFatherAge = 16,
  maxFatherAge = 75,
  spouseBirthYear,
  minSpouseAgeDifference = -25,
  maxSpouseAgeDifference = 60
} = {}) {
  const years = toSortedYears(childrenBirthYears);
  if (years.length === 0) return null;

  const firstChildYear = years[0];
  const lastChildYear = years[years.length - 1];
  let from = lastChildYear - maxFatherAge;
  let to = firstChildYear - minFatherAge;

  if (Number.isFinite(Number(spouseBirthYear))) {
    const spouseYear = Number(spouseBirthYear);
    from = Math.max(from, spouseYear - maxSpouseAgeDifference);
    to = Math.min(to, spouseYear - minSpouseAgeDifference);
  }

  if (from > to) return null;
  return clampRange({ from, to });
}

function deduceMarriageWindow({ childrenBirthYears = [], marriageYear, marriageYearTolerance = 2 } = {}) {
  if (Number.isFinite(Number(marriageYear))) {
    const year = Number(marriageYear);
    const tolerance = Number.isFinite(Number(marriageYearTolerance)) ? Number(marriageYearTolerance) : 2;
    return clampRange({ from: year - tolerance, to: year + tolerance });
  }

  const years = toSortedYears(childrenBirthYears);
  if (years.length === 0) return null;
  return clampRange({ from: years[0] - 20, to: years[0] });
}

function deduceDeathWindow({
  birthYear,
  birthYearRange,
  knownAliveYear,
  deathYear,
  deathYearTolerance = 2,
  maxAge = 110
} = {}) {
  if (Number.isFinite(Number(deathYear))) {
    const year = Number(deathYear);
    const tolerance = Number.isFinite(Number(deathYearTolerance)) ? Number(deathYearTolerance) : 2;
    return clampRange({ from: year - tolerance, to: year + tolerance });
  }

  const from = Number.isFinite(Number(knownAliveYear)) ? Number(knownAliveYear) : null;
  let to = null;
  if (Number.isFinite(Number(birthYear))) {
    to = Number(birthYear) + maxAge;
  } else if (birthYearRange && Number.isFinite(Number(birthYearRange.to))) {
    to = Number(birthYearRange.to) + maxAge;
  }

  if (!from && !to) return null;
  return clampRange({ from: from || 1400, to: to || new Date().getFullYear() });
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

  const relation = (person.role || person.targetRelation || 'unknown').toLowerCase();
  if (relation === 'father') {
    return deduceFatherBirthWindow({
      childrenBirthYears: person.childrenBirthYears,
      spouseBirthYear: person.knownSpouseBirthYear,
      minFatherAge: person.minFatherAge,
      maxFatherAge: person.maxFatherAge
    });
  }

  if (relation === 'child') {
    return null;
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
  deduceFatherBirthWindow,
  deduceMotherBirthWindow,
  deduceMarriageWindow,
  deduceDeathWindow,
  formatYearRange
};
