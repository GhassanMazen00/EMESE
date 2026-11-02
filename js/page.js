/* EMESE: shared start-up for the secondary pages (tracking, sizes, team): language, theme, offline app. */
import { applyLang, setLang, lang } from './i18n.js';

export function startPage() {
  if (lang() === 'en') applyLang('en');
  document.getElementById('langToggle')?.addEventListener('click', () => setLang(lang() === 'en' ? 'ar' : 'en'));
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    btn?.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'dark'));
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  };
  sync();
  btn?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('emese-theme', next); } catch (e) { /* storage blocked */ }
    sync();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (iso, opts = { dateStyle: 'medium' }) =>
  iso ? new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'ar-EG', opts).format(new Date(iso)) : '';

export const fmtMoney = (n, currency = 'EGP') =>
  n == null ? '' : new Intl.NumberFormat(lang() === 'en' ? 'en-EG' : 'ar-EG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n) => new Intl.NumberFormat(lang() === 'en' ? 'en' : 'ar-EG').format(n);

export const param = (k) => new URLSearchParams(location.search).get(k) || '';

/* Header shared by the secondary pages (brand, language, theme). */
export const HEADER = `
  <header class="nav nav-plain" id="top">
    <a class="brand" href="./" aria-label="EMESE"><span class="brand-word" translate="no">EMESE</span><span class="brand-dot" aria-hidden="true"></span></a>
    <div class="nav-actions">
      <button class="lang-toggle" id="langToggle" type="button" data-i18n-attr="aria-label:lang.aria" aria-label="Switch to English"><span data-i18n="lang.other">EN</span></button>
      <button class="theme-toggle" id="themeToggle" type="button" data-i18n-attr="aria-label:theme.aria" aria-label="تغيير الوضع الفاتح والغامق">
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
      </button>
    </div>
  </header>`;
