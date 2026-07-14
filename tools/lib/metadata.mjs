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
    description: clamp(description, 300),
    canonical: url,
    noindex: !!s.needsVerification,
    ogImage: `${SITE}/og-image.png`,
  };
}

export function nationalMetadata(taxYear = 2026) {
  const url = `${SITE}/calculators/quarterly-tax/`;
  return {
    url,
    title: `Quarterly Estimated Tax Calculator ${taxYear} (Self-Employed & 1099) | VestlyFi`,
    description: `Free ${taxYear} quarterly estimated tax calculator for freelancers, 1099 workers, and the self-employed. Estimate your federal self-employment and income tax, get your due dates, and jump to your state.`,
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
