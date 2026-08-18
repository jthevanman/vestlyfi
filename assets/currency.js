/* VestlyCurrency: account-wide currency preference and money formatting.
 *
 * Usage (page must load @supabase/supabase-js@2 first and have its own client):
 *   await VestlyCurrency.load(sb, currentUser.id);   // before the first render
 *   VestlyCurrency.fmt(1234567)                      // "$1.23M"
 *   VestlyCurrency.parseInt_('1,234')                // 1234
 *   VestlyCurrency.groupInt(inputEl)                 // re-groups as the user types
 *
 * THIS IS A DISPLAY PREFERENCE, NOT A CONVERSION. Stored values are plain
 * numbers with no currency attached, so switching the setting relabels the
 * numbers, it never converts them. The app has no FX rate source and no
 * historical rate store, so a converted trend chart could not be drawn
 * honestly. See tools/migrations/2026-08-18-create-user-settings.sql.
 *
 * Formatting matches what the three hand-rolled formatters did before: whole
 * units only (no cents shown), values at or above a million abbreviated to two
 * decimals and an M.
 */
(function () {
  'use strict';

  const CACHE_KEY = 'vf_currency';
  const FALLBACK = 'USD';

  /* Each currency carries the locale its formatting should follow, because the
   * separators belong to the region, not to the currency symbol: EUR is
   * "1.234 €" in Germany and "€1,234" in Ireland. One representative locale per
   * currency keeps grouping, symbol placement, and input parsing consistent
   * with each other, which is what actually matters. */
  const CURRENCIES = [
    { code: 'USD', locale: 'en-US', label: 'US Dollar' },
    { code: 'EUR', locale: 'de-DE', label: 'Euro' },
    { code: 'GBP', locale: 'en-GB', label: 'British Pound' },
    { code: 'CAD', locale: 'en-CA', label: 'Canadian Dollar' },
    { code: 'AUD', locale: 'en-AU', label: 'Australian Dollar' },
    { code: 'NZD', locale: 'en-NZ', label: 'New Zealand Dollar' },
    { code: 'CHF', locale: 'de-CH', label: 'Swiss Franc' },
    { code: 'JPY', locale: 'ja-JP', label: 'Japanese Yen' },
    { code: 'CNY', locale: 'zh-CN', label: 'Chinese Yuan' },
    { code: 'HKD', locale: 'en-HK', label: 'Hong Kong Dollar' },
    { code: 'SGD', locale: 'en-SG', label: 'Singapore Dollar' },
    { code: 'INR', locale: 'en-IN', label: 'Indian Rupee' },
    { code: 'KRW', locale: 'ko-KR', label: 'South Korean Won' },
    { code: 'SEK', locale: 'sv-SE', label: 'Swedish Krona' },
    { code: 'NOK', locale: 'nb-NO', label: 'Norwegian Krone' },
    { code: 'DKK', locale: 'da-DK', label: 'Danish Krone' },
    { code: 'PLN', locale: 'pl-PL', label: 'Polish Zloty' },
    { code: 'CZK', locale: 'cs-CZ', label: 'Czech Koruna' },
    { code: 'ZAR', locale: 'en-ZA', label: 'South African Rand' },
    { code: 'BRL', locale: 'pt-BR', label: 'Brazilian Real' },
    { code: 'MXN', locale: 'es-MX', label: 'Mexican Peso' },
    { code: 'AED', locale: 'en-AE', label: 'UAE Dirham' },
    { code: 'ILS', locale: 'he-IL', label: 'Israeli Shekel' },
    { code: 'TRY', locale: 'tr-TR', label: 'Turkish Lira' }
  ];

  const byCode = {};
  CURRENCIES.forEach(c => { byCode[c.code] = c; });

  let sb = null;
  let active = byCode[FALLBACK];
  let listeners = [];

  /* Formatters are rebuilt only when the currency changes. Intl.NumberFormat
   * construction is the expensive part and fmt() is called once per rendered
   * cell, several hundred times on a full holdings table. */
  let nfMoney = null, nfPlain = null, sepGroup = ',', sepDecimal = '.', symbolStr = '$';

  function buildFormatters() {
    nfMoney = new Intl.NumberFormat(active.locale, {
      style: 'currency',
      currency: active.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    nfPlain = new Intl.NumberFormat(active.locale, { maximumFractionDigits: 0 });

    const parts = new Intl.NumberFormat(active.locale).formatToParts(1234567.8);
    sepGroup = (parts.find(p => p.type === 'group') || {}).value || ',';
    sepDecimal = (parts.find(p => p.type === 'decimal') || {}).value || '.';

    const cur = nfMoney.formatToParts(0).find(p => p.type === 'currency');
    symbolStr = cur ? cur.value : active.code;
  }

  const NUMERIC = { integer: 1, group: 1, decimal: 1, fraction: 1 };

  /* Appends a suffix directly after the numeric run rather than after the whole
   * string, so the M lands inside the number for suffix-symbol locales:
   * "1,23 Mio €" style placement rather than a trailing "1,23 €M". */
  function withSuffix(value, suffix) {
    const parts = new Intl.NumberFormat(active.locale, {
      style: 'currency',
      currency: active.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).formatToParts(value);
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      out += parts[i].value;
      const next = parts[i + 1];
      if (NUMERIC[parts[i].type] && !(next && NUMERIC[next.type])) out += suffix;
    }
    return out;
  }

  function fmt(n) {
    const num = Number(n);
    if (!isFinite(num)) return '—';
    if (num === 0) return nfMoney.format(0);
    return Math.abs(num) >= 1e6 ? withSuffix(num / 1e6, 'M') : nfMoney.format(Math.round(num));
  }

  /* Grouped number with no symbol, for prefilling input fields. */
  function fmtPlain(n) {
    const num = Number(n);
    return isFinite(num) ? nfPlain.format(Math.round(num)) : '';
  }

  /* Whole-unit parse. Every non-digit is dropped, which is locale-proof
   * precisely because there is no decimal to protect: the field it reads is
   * kept digits-only by groupInt as the user types. */
  function parseInt_(val) {
    const digits = String(val == null ? '' : val).replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }

  /* Parse for fields that accept cents. Only the active locale's decimal
   * separator splits the fraction; its group separator is dropped. Anything
   * else would make "1,234" ambiguous between 1234 and 1.234. */
  function parseDec(val) {
    let s = String(val == null ? '' : val).trim();
    if (!s) return 0;
    const neg = /^-/.test(s);
    s = s.split(sepDecimal);
    const whole = (s[0] || '').replace(/[^0-9]/g, '');
    const frac = s.length > 1 ? (s[1] || '').replace(/[^0-9]/g, '') : '';
    const n = Number((whole || '0') + (frac ? '.' + frac : ''));
    return isFinite(n) ? (neg ? -n : n) : 0;
  }

  /* In-place input re-grouping. Whole units only. */
  function groupInt(el) {
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value = raw ? nfPlain.format(Number(raw)) : '';
  }

  /* In-place input re-grouping that preserves a trailing decimal separator and
   * any digits after it, so typing does not fight the cursor mid-entry. */
  function groupDec(el) {
    const src = el.value;
    const idx = src.indexOf(sepDecimal);
    const wholeRaw = (idx === -1 ? src : src.slice(0, idx)).replace(/[^0-9]/g, '');
    const whole = wholeRaw ? nfPlain.format(Number(wholeRaw)) : '';
    if (idx === -1) { el.value = whole; return; }
    const frac = src.slice(idx + sepDecimal.length).replace(/[^0-9]/g, '').slice(0, 2);
    el.value = (whole || '0') + sepDecimal + frac;
  }

  function setActive(code) {
    active = byCode[code] || byCode[FALLBACK];
    buildFormatters();
    try { localStorage.setItem(CACHE_KEY, active.code); } catch (e) { /* private mode */ }
  }

  /* Reads the cached choice synchronously so the very first paint is already in
   * the right currency. load() reconciles with the server immediately after;
   * the server value always wins. */
  function initFromCache() {
    let cached = null;
    try { cached = localStorage.getItem(CACHE_KEY); } catch (e) { /* private mode */ }
    active = byCode[cached] || byCode[FALLBACK];
    buildFormatters();
  }

  /* The net worth tracker calls load() from loadEntries, which re-runs after
   * every save. The preference cannot change behind our back mid-session (the
   * picker writes through save(), which updates state directly), so one fetch
   * per user is enough and the rest would be dead round trips. */
  let loadedFor = null;

  async function load(client, userId) {
    sb = client || sb;
    if (!sb || !userId) return active.code;
    if (loadedFor === userId) return active.code;
    try {
      const { data, error } = await sb
        .from('user_settings').select('currency').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      /* No row is the normal state for every user who has never opened the
       * picker. That is the USD default, not an error, and nothing is written
       * until the user actually chooses. */
      setActive(data && data.currency ? data.currency : FALLBACK);
      loadedFor = userId;
    } catch (e) {
      /* Left unmarked so a transient failure retries on the next call rather
       * than pinning the session to the fallback currency. */
      console.error('currency preference load failed, using cached/default', e);
    }
    return active.code;
  }

  async function save(client, userId, code) {
    sb = client || sb;
    if (!sb || !userId || !byCode[code]) return { error: 'bad request' };
    const { error } = await sb.from('user_settings').upsert(
      { user_id: userId, currency: code, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) return { error };
    setActive(code);
    listeners.forEach(fn => { try { fn(code); } catch (e) { console.error(e); } });
    return {};
  }

  initFromCache();

  window.VestlyCurrency = {
    CURRENCIES: CURRENCIES,
    load: load,
    save: save,
    fmt: fmt,
    fmtPlain: fmtPlain,
    parseInt_: parseInt_,
    parseDec: parseDec,
    groupInt: groupInt,
    groupDec: groupDec,
    code: () => active.code,
    locale: () => active.locale,
    label: () => active.label,
    symbol: () => symbolStr,
    /* Zero-value string for placeholders, so a field reads "0 €" not "$0". */
    zero: () => nfMoney.format(0),
    /* Decorative stand-in for a hidden amount in private mode. Built from the
     * formatted zero so the symbol keeps its side of the number. */
    masked: () => nfMoney.format(0).replace('0', '•••,•••'),
    onChange: fn => { listeners.push(fn); }
  };
})();
