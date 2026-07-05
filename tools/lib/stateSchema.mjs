/**
 * State data schema + build-time validator.
 *
 * `validateState` returns an array of error strings ([] === valid). The
 * generator collects errors across all files and throws, failing the build
 * loudly so invalid tax data can never ship.
 *
 * @typedef {Object} Bracket
 * @property {number} min
 * @property {number|null} max   - null === "and up" (top bracket)
 * @property {number} rate       - fraction, e.g. 0.044 for 4.4%
 *
 * @typedef {Object} StateData
 * @property {string} slug
 * @property {string} name
 * @property {string} abbreviation
 * @property {boolean} hasStateIncomeTax
 * @property {number} taxYear
 * @property {Bracket[]} brackets_single
 * @property {Bracket[]} brackets_married
 * @property {number|null} standardDeduction_single
 * @property {number|null} standardDeduction_married
 * @property {boolean} hasQuarterlyRequirement
 * @property {number|null} stateQuarterlyThreshold
 * @property {string|null} stateTaxAgencyName
 * @property {string|null} stateTaxAgencyUrl
 * @property {string|null} statePaymentPortalUrl
 * @property {number[]|null} quarterlyWeights - 4 fractions summing to 1, or null (equal)
 * @property {string} dueDateNotes
 * @property {string} selfEmploymentNotes
 * @property {string[]} uniqueFacts
 * @property {string[]} [sources] - official source URLs the data was verified against
 * @property {boolean} needsVerification - true => page ships noindex
 * @property {string|null} lastVerified  - ISO date the data was verified
 */

const REQUIRED_KEYS = [
  'slug', 'name', 'abbreviation', 'hasStateIncomeTax', 'taxYear',
  'brackets_single', 'brackets_married', 'standardDeduction_single',
  'standardDeduction_married', 'hasQuarterlyRequirement', 'stateQuarterlyThreshold',
  'stateTaxAgencyName', 'stateTaxAgencyUrl', 'statePaymentPortalUrl',
  'dueDateNotes', 'selfEmploymentNotes', 'uniqueFacts',
  'needsVerification', 'lastVerified',
];

/** @param {any} s @returns {string[]} error messages */
export function validateState(s) {
  const e = [];
  const id = (s && s.slug) || (s && s.abbreviation) || '<unknown>';
  const at = (msg) => `[${id}] ${msg}`;

  if (typeof s !== 'object' || s == null) return [`[<file>] not an object`];

  for (const k of REQUIRED_KEYS) {
    if (!(k in s)) e.push(at(`missing required key "${k}"`));
  }

  if (typeof s.slug !== 'string' || !/^[a-z][a-z-]+$/.test(s.slug || '')) {
    e.push(at(`slug must be lowercase kebab-case`));
  }
  if (typeof s.name !== 'string' || !s.name) e.push(at(`name must be a non-empty string`));
  if (typeof s.abbreviation !== 'string' || !/^[A-Z]{2}$/.test(s.abbreviation || '')) {
    e.push(at(`abbreviation must be 2 uppercase letters`));
  }
  if (typeof s.hasStateIncomeTax !== 'boolean') e.push(at(`hasStateIncomeTax must be boolean`));
  if (s.taxYear !== 2026) e.push(at(`taxYear must be 2026 for this build`));
  if (typeof s.hasQuarterlyRequirement !== 'boolean') e.push(at(`hasQuarterlyRequirement must be boolean`));
  if (typeof s.needsVerification !== 'boolean') e.push(at(`needsVerification must be boolean`));
  if (!Array.isArray(s.uniqueFacts) || s.uniqueFacts.length < 2) {
    e.push(at(`uniqueFacts must have at least 2 entries`));
  }

  e.push(...validateBrackets(s.brackets_single, at, 'brackets_single'));
  e.push(...validateBrackets(s.brackets_married, at, 'brackets_married'));
  e.push(...nullableNumber(s.standardDeduction_single, at, 'standardDeduction_single'));
  e.push(...nullableNumber(s.standardDeduction_married, at, 'standardDeduction_married'));
  e.push(...nullableNumber(s.stateQuarterlyThreshold, at, 'stateQuarterlyThreshold'));

  for (const urlKey of ['stateTaxAgencyUrl', 'statePaymentPortalUrl']) {
    const v = s[urlKey];
    if (v != null && (typeof v !== 'string' || !/^https:\/\//.test(v))) {
      e.push(at(`${urlKey} must be null or an https:// URL`));
    }
  }

  if (s.stateTaxBasis != null &&
      !['federal_taxable_income', 'federal_agi', 'state_gross'].includes(s.stateTaxBasis)) {
    e.push(at(`stateTaxBasis must be one of federal_taxable_income | federal_agi | state_gross`));
  }

  if (s.sources != null) {
    if (!Array.isArray(s.sources)) e.push(at(`sources must be an array of https URLs`));
    else s.sources.forEach((u, i) => {
      if (typeof u !== 'string' || !/^https:\/\//.test(u)) e.push(at(`sources[${i}] must be an https URL`));
    });
  }

  if (s.quarterlyWeights != null) {
    if (!Array.isArray(s.quarterlyWeights) || s.quarterlyWeights.length !== 4) {
      e.push(at(`quarterlyWeights must be null or an array of 4 numbers`));
    } else {
      const sum = s.quarterlyWeights.reduce((a, b) => a + (Number(b) || 0), 0);
      if (Math.abs(sum - 1) > 0.001) e.push(at(`quarterlyWeights must sum to 1 (got ${sum})`));
    }
  }

  // Cross-field integrity: an income-tax state that is meant to be indexed
  // (needsVerification === false) MUST have real bracket + agency data.
  if (s.hasStateIncomeTax === true && s.needsVerification === false) {
    if (!Array.isArray(s.brackets_single) || s.brackets_single.length === 0) {
      e.push(at(`income-tax state marked verified but brackets_single is empty`));
    }
    if (!s.stateTaxAgencyName || !s.stateTaxAgencyUrl) {
      e.push(at(`income-tax state marked verified but agency name/URL missing`));
    }
    if (!s.lastVerified) e.push(at(`verified state must set lastVerified date`));
    if (!Array.isArray(s.sources) || s.sources.length === 0) {
      e.push(at(`verified income-tax state must cite at least one official source URL`));
    }
  }

  // A no-income-tax state should not carry brackets.
  if (s.hasStateIncomeTax === false) {
    if ((s.brackets_single && s.brackets_single.length) || (s.brackets_married && s.brackets_married.length)) {
      e.push(at(`no-income-tax state should have empty brackets`));
    }
  }

  return e;
}

function validateBrackets(arr, at, key) {
  const e = [];
  // null === "pending verification" (allowed; cross-field checks below still
  // force verified income-tax states to carry real bracket arrays).
  if (arr === null) return e;
  if (!Array.isArray(arr)) { e.push(at(`${key} must be null (pending) or an array (use [] if none)`)); return e; }
  let prevMax = 0;
  arr.forEach((b, i) => {
    if (typeof b !== 'object' || b == null) { e.push(at(`${key}[${i}] not an object`)); return; }
    if (typeof b.min !== 'number' || b.min < 0) e.push(at(`${key}[${i}].min must be >= 0`));
    if (!(b.max === null || (typeof b.max === 'number' && b.max > b.min))) {
      e.push(at(`${key}[${i}].max must be null or > min`));
    }
    if (typeof b.rate !== 'number' || b.rate < 0 || b.rate > 1) {
      e.push(at(`${key}[${i}].rate must be a fraction between 0 and 1`));
    }
    if (i === 0 && b.min !== 0) e.push(at(`${key}[0].min must be 0`));
    if (i > 0 && b.min !== prevMax) e.push(at(`${key}[${i}].min must equal previous bracket max (contiguous)`));
    prevMax = b.max;
  });
  return e;
}

function nullableNumber(v, at, key) {
  if (v === null) return [];
  if (typeof v !== 'number' || v < 0) return [at(`${key} must be null or a number >= 0`)];
  return [];
}
