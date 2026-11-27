/* VestlyFi theme switch, shared by every page with the light/dark button.
   Load it in the <head> (not async/defer) so the saved theme applies before
   the page paints. The choice is stored as 'vf-theme' in this browser, the
   same key Home and Budget use, so it follows you between pages.

   Button markup (styles in /assets/theme.css):
     <button class="vf-theme-btn" type="button" onclick="vfTheme.toggle()" aria-label="Switch light or dark mode">…sun/moon svgs…</button>
   or let this file fill any element with data-vf-theme-btn.

   Charts drawn in script read colors with vfTheme.color('--accent') and redraw
   on the 'vf-theme' window event. */
(function () {
  var KEY = 'vf-theme';
  var root = document.documentElement;
  function apply(t) {
    if (t === 'light') root.dataset.theme = 'light'; else delete root.dataset.theme;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === 'light' ? '#f3f2ef' : '#0b0b0b';
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  apply(saved === 'light' ? 'light' : 'dark');

  var ICONS = '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'
            + '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';

  window.vfTheme = {
    get: function () { return root.dataset.theme === 'light' ? 'light' : 'dark'; },
    toggle: function () {
      var t = this.get() === 'light' ? 'dark' : 'light';
      apply(t);
      try { localStorage.setItem(KEY, t); } catch (e) {}
      window.dispatchEvent(new CustomEvent('vf-theme', { detail: t }));
    },
    color: function (name) { return getComputedStyle(root).getPropertyValue(name).trim(); },
    icons: ICONS
  };

  function fill() {
    apply(window.vfTheme.get());   // the theme-color meta may come after this script
    document.querySelectorAll('[data-vf-theme-btn]').forEach(function (el) {
      if (el.dataset.vfThemeReady) return;
      el.dataset.vfThemeReady = '1';
      el.classList.add('vf-theme-btn');
      el.setAttribute('type', 'button');
      el.setAttribute('aria-label', 'Switch light or dark mode');
      el.innerHTML = ICONS;
      el.addEventListener('click', function () { window.vfTheme.toggle(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
