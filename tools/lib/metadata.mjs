/**
 * Per-page metadata generation: unique title, description, canonical, OG.
 */
const SITE = 'https://vestlyfi.com';

/** @param {import('./stateSchema.mjs').StateData} s */
export function generateStateMetadata(s) {
  const url = `${SITE}/calculators/quarterly-tax/${s.slug}/`;
  const title = `${s.name} Quarterly Estimated Tax Calculator ${s.taxYear} | VestlyFi`;
  // Unique description referencing one state-specific fact.
  const fact = firstSentence(s.uniqueFacts[0]);
  const description = s.hasStateIncomeTax
    ? `Estimate your ${s.taxYear} quarterly estimated taxes in ${s.name}: federal self-employment tax, federal income tax, and ${s.name} state tax. ${fact} Free calculator with due dates and safe-harbor math.`
    : `Do you pay quarterly taxes in ${s.name}? ${fact} Estimate your ${s.taxYear} federal quarterly payments and due dates with this free calculator.`;
  return {
    url,
    title,
    // A hand-written metaDescription (short, state fact first) wins over the
    // template sentence, which runs past Google's ~160-character cut.
    description: s.metaDescription || clamp(description, 300),
    canonical: url,
    // indexWhilePending: an editorial call to index a page whose state rates
    // are still unverified (it shows the pending banner and federal-only math).
    noindex: !!s.needsVerification && !s.indexWhilePending,
    ogImage: `${SITE}/og-image.png`,
  };
}

export function nationalMetadata(taxYear = 2026) {
  const url = `${SITE}/calculators/quarterly-tax/`;
  return {
    url,
    title: `1099 Tax Calculator ${taxYear}: Quarterly Estimated Taxes | VestlyFi`,
    description: `Calculate taxes on 1099 income for ${taxYear}. Enter what you earn and see your self-employment tax, federal income tax, what to pay each quarter, and when it's due.`,
    canonical: url,
    noindex: false,
    ogImage: `${SITE}/og-image.png`,
  };
}

function firstSentence(str) {
  if (!str) return '';
  // Terminator must end the text or precede whitespace, so decimals like 4.7% don't split.
  const m = str.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : str).trim();
}
function clamp(str, n) {
  return str.length <= n ? str : str.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

export { SITE };
