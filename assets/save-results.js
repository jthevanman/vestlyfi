/* VestlySave: shared "save results to your account" module.
 *
 * Usage (page must load @supabase/supabase-js@2 first):
 *   VestlySave.init({
 *     calculator: 'compound-interest',      // slug; also the page path (/<slug>/)
 *     saveAnchor: '.result-banner',         // save button is inserted after this element
 *     cardAnchor: '.calc-panel',            // saved-results card is inserted after this element
 *     applyInputs(inputs) { ... }           // restore form state from saved inputs AND re-run the calc
 *   });
 *   // at the end of the page's calc function:
 *   VestlySave.capture({ inputs: {...}, outputs: {...}, label: '...' });
 *
 * All injected elements/classes are prefixed vfs- to avoid page collisions.
 * Pending saves survive the email-confirmation round trip via localStorage.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://bgbxninvpfhizjalicee.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYnhuaW52cGZoaXpqYWxpY2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTg1NzMsImV4cCI6MjA4ODY3NDU3M30.W74cdfwClaYMC1YVyh4zRp-8ylqvFN61cCpSERe2tWg';
  const PENDING_KEY = 'vf_pending_save';

  let sb = null, cfg = null, currentUser = null, lastResult = null, savedList = [];

  const CSS = `
.vfs-save-row{display:flex;flex-direction:column;align-items:center;gap:6px;margin:16px 0 24px}
.vfs-btn-save{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;background:none;border:1px solid rgba(201,168,76,0.15);border-radius:10px;color:#e8c97a;font-family:'Outfit',sans-serif;font-size:0.88rem;font-weight:500;cursor:pointer;transition:all .18s}
.vfs-btn-save:hover:not(:disabled){background:rgba(201,168,76,0.13);border-color:#c9a84c}
.vfs-btn-save:disabled{cursor:default;opacity:0.8}
.vfs-status{font-size:0.78rem;min-height:16px;color:rgba(245,240,232,0.35)}
.vfs-status.ok{color:#4ade80}
.vfs-status.err{color:#e05c5c}
.vfs-card{background:#1a2540;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px 24px;margin:0 0 28px}
.vfs-card-title{font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(245,240,232,0.35);margin-bottom:6px;font-weight:500;font-family:'Outfit',sans-serif}
.vfs-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)}
.vfs-item:last-child{border-bottom:none}
.vfs-item-label{font-size:0.88rem;color:rgba(245,240,232,0.6);font-family:'Outfit',sans-serif}
.vfs-item-date{font-size:0.72rem;color:rgba(245,240,232,0.35);margin-top:2px}
.vfs-item-actions{display:flex;gap:8px;flex-shrink:0}
.vfs-btn{background:none;border:1px solid rgba(255,255,255,0.07);border-radius:8px;color:rgba(245,240,232,0.6);padding:6px 14px;font-family:'Outfit',sans-serif;font-size:0.78rem;cursor:pointer;transition:all .15s}
.vfs-btn:hover{border-color:rgba(201,168,76,0.15);color:#f5f0e8}
.vfs-btn.del:hover{border-color:rgba(224,92,92,0.5);color:#e05c5c}
.vfs-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:600;overflow-y:auto;padding:40px 20px}
.vfs-modal-box{max-width:420px;margin:0 auto;background:#111827;border:1px solid rgba(201,168,76,0.2);border-radius:16px;padding:32px;font-family:'Outfit',sans-serif}
.vfs-modal-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
.vfs-modal-title{font-size:1.2rem;color:#e8c97a}
.vfs-modal-close{background:none;border:none;color:rgba(245,240,232,0.4);font-size:1.6rem;cursor:pointer;line-height:1;margin-left:16px}
.vfs-modal-sub{font-size:0.83rem;color:rgba(245,240,232,0.35);line-height:1.6;margin-bottom:22px}
.vfs-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:22px}
.vfs-tab{flex:1;padding:10px;text-align:center;font-size:0.82rem;color:rgba(245,240,232,0.35);background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;transition:all .15s;font-family:'Outfit',sans-serif}
.vfs-tab.active{color:#f5f0e8;border-bottom-color:#c9a84c}
.vfs-field{margin-bottom:14px}
.vfs-field label{display:block;font-size:0.72rem;color:rgba(245,240,232,0.35);margin-bottom:6px;letter-spacing:0.06em;text-transform:uppercase}
.vfs-field input{width:100%;box-sizing:border-box;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;color:#f5f0e8;font-family:'Outfit',sans-serif;font-size:0.9rem;font-weight:300;outline:none;transition:border-color .15s;appearance:none}
.vfs-field input:focus{border-color:#c9a84c}
.vfs-btn-auth{width:100%;padding:13px;background:linear-gradient(135deg,#c9a84c,#e8c97a);border:none;border-radius:10px;color:#0a0f1e;font-family:'Outfit',sans-serif;font-weight:600;font-size:0.9rem;cursor:pointer;margin-top:4px}
.vfs-msg{font-size:0.8rem;margin-top:10px;text-align:center;min-height:18px;color:rgba(245,240,232,0.35)}
.vfs-msg.err{color:#e05c5c}
.vfs-msg.ok{color:#4ade80}
.vfs-alt{text-align:center;margin-top:12px}
.vfs-link{color:rgba(245,240,232,0.35);font-size:0.78rem;text-decoration:none;transition:color .15s}
.vfs-link:hover{color:#e8c97a}
`;

  const MODAL_HTML = `
<div class="vfs-modal-box">
  <div class="vfs-modal-head">
    <div class="vfs-modal-title">Save this result</div>
    <button type="button" class="vfs-modal-close" aria-label="Close">×</button>
  </div>
  <p class="vfs-modal-sub">Create a free account to save your results and access them from any device.</p>
  <div class="vfs-tabs">
    <button type="button" class="vfs-tab active" data-tab="signup">Create Account</button>
    <button type="button" class="vfs-tab" data-tab="signin">Sign In</button>
  </div>
  <div data-form="signup">
    <div class="vfs-field"><label>Email</label><input type="email" data-f="suEmail" placeholder="you@example.com"></div>
    <div class="vfs-field"><label>Password</label><input type="password" data-f="suPassword" placeholder="At least 6 characters"></div>
    <div class="vfs-field"><label>Confirm Password</label><input type="password" data-f="suConfirm" placeholder="Re-enter your password"></div>
    <button type="button" class="vfs-btn-auth" data-action="signup">Create Account &amp; Save</button>
    <div class="vfs-msg" data-msg="signup"></div>
  </div>
  <div data-form="signin" style="display:none">
    <div class="vfs-field"><label>Email</label><input type="email" data-f="siEmail" placeholder="you@example.com"></div>
    <div class="vfs-field"><label>Password</label><input type="password" data-f="siPassword" placeholder="••••••••"></div>
    <button type="button" class="vfs-btn-auth" data-action="signin">Sign In &amp; Save</button>
    <div class="vfs-alt"><a class="vfs-link" href="/net-worth/">Forgot your password?</a></div>
    <div class="vfs-msg" data-msg="signin"></div>
  </div>
</div>`;

  let modal, saveBtn, statusEl, card, itemsEl;

  function track(event) {
    if (typeof gtag === 'function') gtag('event', event, { calculator: cfg.calculator });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function q(sel) { return modal.querySelector(sel); }

  function inject() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.className = 'vfs-modal';
    modal.id = 'modal-vfs-auth'; // "modal-" prefix so host pages' modal-open guards see it
    modal.innerHTML = MODAL_HTML;
    document.body.appendChild(modal);

    const saveRow = document.createElement('div');
    saveRow.className = 'vfs-save-row';
    saveRow.innerHTML = '<button type="button" class="vfs-btn-save">Save this result</button><div class="vfs-status"></div>';
    const saveAnchor = document.querySelector(cfg.saveAnchor);
    if (saveAnchor) saveAnchor.insertAdjacentElement('afterend', saveRow);
    saveBtn = saveRow.querySelector('.vfs-btn-save');
    statusEl = saveRow.querySelector('.vfs-status');

    card = document.createElement('div');
    card.className = 'vfs-card';
    card.style.display = 'none';
    card.innerHTML = '<div class="vfs-card-title">Your Saved Results</div><div class="vfs-items"></div>';
    const cardAnchor = document.querySelector(cfg.cardAnchor);
    if (cardAnchor) cardAnchor.insertAdjacentElement('afterend', card);
    itemsEl = card.querySelector('.vfs-items');

    // Wiring
    saveBtn.addEventListener('click', saveResult);
    q('.vfs-modal-close').addEventListener('click', closeAuthModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });
    modal.querySelectorAll('.vfs-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    q('[data-action="signup"]').addEventListener('click', signUp);
    q('[data-action="signin"]').addEventListener('click', signIn);
    modal.querySelectorAll('[data-form="signup"] input').forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); signUp(); } }));
    modal.querySelectorAll('[data-form="signin"] input').forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); signIn(); } }));
    itemsEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.load) loadSaved(btn.dataset.load);
      if (btn.dataset.del) deleteSaved(btn.dataset.del);
    });
  }

  /* ── save flow ── */

  function resetBtn() {
    if (!saveBtn) return;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save this result';
    statusEl.textContent = '';
    statusEl.className = 'vfs-status';
  }

  function saveResult() {
    if (!lastResult) return;
    track('save_result_click');
    if (!currentUser) {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ calculator: cfg.calculator, ...lastResult }));
      openAuthModal();
      return;
    }
    doSave(lastResult);
  }

  async function doSave(result) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const { error } = await sb.from('saved_results').insert([{
      user_id: currentUser.id,
      calculator: cfg.calculator,
      label: result.label,
      inputs: result.inputs,
      outputs: result.outputs
    }]);
    if (error) {
      console.error(error);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save this result';
      statusEl.textContent = 'Could not save. Please try again.';
      statusEl.className = 'vfs-status err';
      return;
    }
    saveBtn.textContent = 'Saved ✓';
    statusEl.textContent = 'Saved to your account.';
    statusEl.className = 'vfs-status ok';
    track('save_result_complete');
    loadList();
  }

  /* ── auth ── */

  async function afterAuth() {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      try {
        const pending = JSON.parse(raw);
        if (pending.calculator === cfg.calculator && pending.inputs) {
          localStorage.removeItem(PENDING_KEY);
          cfg.applyInputs(pending.inputs); // restores form + re-runs calc (which calls capture)
          lastResult = { inputs: pending.inputs, outputs: pending.outputs, label: pending.label };
          await doSave(lastResult);
        }
      } catch (e) { localStorage.removeItem(PENDING_KEY); }
    }
    await loadList();
    const savedId = new URLSearchParams(window.location.search).get('saved');
    if (savedId) loadSaved(savedId);
  }

  function openAuthModal() {
    modal.style.display = 'block';
    setTimeout(() => q('[data-f="suEmail"]').focus(), 50);
  }
  function closeAuthModal() { modal.style.display = 'none'; }

  function switchTab(tab) {
    modal.querySelectorAll('.vfs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    q('[data-form="signup"]').style.display = tab === 'signup' ? 'block' : 'none';
    q('[data-form="signin"]').style.display = tab === 'signin' ? 'block' : 'none';
    setTimeout(() => q(tab === 'signup' ? '[data-f="suEmail"]' : '[data-f="siEmail"]').focus(), 50);
  }

  function setMsg(which, cls, text) {
    const el = q(`[data-msg="${which}"]`);
    el.className = 'vfs-msg' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  async function signUp() {
    const email = q('[data-f="suEmail"]').value.trim();
    const password = q('[data-f="suPassword"]').value;
    const confirm = q('[data-f="suConfirm"]').value;
    if (!email) { setMsg('signup', 'err', 'Please enter your email.'); return; }
    if (password.length < 6) { setMsg('signup', 'err', 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setMsg('signup', 'err', 'Passwords do not match.'); return; }
    setMsg('signup', '', 'Creating account…');
    const { error } = await sb.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + '/' + cfg.calculator + '/' }
    });
    if (error) { setMsg('signup', 'err', error.message); return; }
    track('save_result_signup');
    setMsg('signup', 'ok', 'Account created! Check your email to confirm; your result will be saved automatically when you return.');
  }

  async function signIn() {
    const email = q('[data-f="siEmail"]').value.trim();
    const password = q('[data-f="siPassword"]').value;
    if (!email || !password) { setMsg('signin', 'err', 'Please enter your email and password.'); return; }
    setMsg('signin', '', 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setMsg('signin', 'err', error.message); return; }
    setMsg('signin', '', '');
    // onAuthStateChange completes the pending save and closes the modal
  }

  /* ── saved list ── */

  async function loadList() {
    if (!currentUser) return;
    const { data, error } = await sb.from('saved_results')
      .select('*')
      .eq('calculator', cfg.calculator)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    savedList = data || [];
    renderList();
  }

  function renderList() {
    if (!card) return;
    if (!savedList.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    itemsEl.innerHTML = savedList.map(s => `
      <div class="vfs-item">
        <div>
          <div class="vfs-item-label">${escapeHtml(s.label || 'Saved result')}</div>
          <div class="vfs-item-date">${new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div class="vfs-item-actions">
          <button type="button" class="vfs-btn" data-load="${s.id}">Load</button>
          <button type="button" class="vfs-btn del" data-del="${s.id}" aria-label="Delete saved result">✕</button>
        </div>
      </div>`).join('');
  }

  function loadSaved(id) {
    const s = savedList.find(x => x.id === id);
    if (!s) return;
    cfg.applyInputs(s.inputs);
    track('saved_result_loaded');
    const row = document.querySelector('.vfs-save-row');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deleteSaved(id) {
    if (!confirm('Delete this saved result?')) return;
    const { error } = await sb.from('saved_results').delete().eq('id', id);
    if (error) { console.error(error); return; }
    savedList = savedList.filter(s => s.id !== id);
    renderList();
  }

  /* ── public API ── */

  window.VestlySave = {
    init(config) {
      cfg = config;
      sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
      inject();
      (async () => {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user && !currentUser) { currentUser = session.user; afterAuth(); }
      })();
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user && !currentUser) {
          currentUser = session.user;
          closeAuthModal();
          afterAuth();
        } else if (event === 'SIGNED_OUT') {
          currentUser = null;
          savedList = [];
          if (card) card.style.display = 'none';
        }
      });
    },
    capture(result) {
      lastResult = result;
      resetBtn();
    }
  };
})();
