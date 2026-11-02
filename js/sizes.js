/* EMESE: uniform size collection. sizes.html?l=<token> is the employees' form;
 * sizes.html?a=<admin token> is the client's list (totals, every entry, CSV). */
import { addStrings, ui } from './i18n.js';
import { startPage, esc, fmtNum, param, HEADER } from './page.js';
import { ready, rpc } from './api.js';
import { SITE_BASE } from './config.js';

document.getElementById('header').innerHTML = HEADER;

addStrings({
  'sz.loading': 'Opening the list…',
  'sz.name': 'Your name',
  'sz.size': 'Your size',
  'sz.qty': 'Pieces',
  'sz.note': 'Note',
  'sz.notePh': 'e.g. long sleeve',
  'sz.send': 'Save my size',
  'sz.doneTitle': 'Your size is saved',
  'sz.again': 'Add someone else',
  'sz.shareText': 'Send this link to your team so everyone adds their size:',
  'sz.shareLabel': 'Link for your team',
  'sz.shareWa': 'Send on WhatsApp',
  'sz.colName': 'Name',
  'sz.colSize': 'Size',
  'sz.colQty': 'Pieces',
  'sz.colNote': 'Note',
  'sz.empty': 'Nobody has added a size yet. Send the link to your team.',
  'sz.csv': 'Download the sheet (CSV)',
  'sz.refresh': 'Refresh'
}, {
  ar: {
    fillSub: (p) => `اكتب اسمك واختار مقاسك${p ? ` في ${p}` : ''}. مش محتاج تعمل حساب.`,
    send: 'سجّل مقاسي',
    doneText: (n) => `شكرًا! لحد دلوقتي سجّل ${fmtNum(n)} شخص.`,
    total: (n) => `${fmtNum(n)} قطعة`,
    people: (n) => `${fmtNum(n)} شخص`,
    closed: ['القايمة اتقفلت', 'التسجيل في القايمة دي خلص. لو محتاج تسجّل، كلّم المسؤول في شركتك.'],
    notFound: ['مش لاقيين القايمة دي', 'اتأكد إنك فتحت اللينك كامل زي ما وصلك.'],
    offline: ['مش متوصّل لسه', 'الموقع لسه مش متوصّل بقاعدة البيانات.'],
    err: { name: 'اكتب اسمك (حرفين على الأقل).', size: 'اختار مقاسك.', qty: 'من ١ لـ ٥٠ قطعة.', generic: 'المقاس ماتسجلش. جرّب تاني.' },
    copied: 'اتنسخ',
    waText: (t, link) => `سجّل مقاسك لـ ${t} من هنا: ${link}`,
    sending: 'بنسجّل…'
  },
  en: {
    fillSub: (p) => `Add your name and pick your size${p ? ` for the ${p}` : ''}. No account needed.`,
    send: 'Save my size',
    doneText: (n) => `Thank you! ${n} ${n === 1 ? 'person has' : 'people have'} added their size so far.`,
    total: (n) => `${n} pieces`,
    people: (n) => `${n} people`,
    closed: ['This list is closed', 'This list stopped taking sizes. Ask the person in charge at your company.'],
    notFound: ["We can't find this list", 'Make sure you opened the full link you received.'],
    offline: ['Not connected yet', "The site isn't connected to the database yet."],
    err: { name: 'Add your name (2 letters or more).', size: 'Pick your size.', qty: 'From 1 to 50 pieces.', generic: "Your size wasn't saved. Try again." },
    copied: 'Copied',
    waText: (t, link) => `Add your size for ${t} here: ${link}`,
    sending: 'Saving…'
  }
});

startPage();
const $ = (id) => document.getElementById(id);
const listToken = param('l');
const adminToken = param('a');
let data = null;

function show(id) { ['loading', 'problem', 'fill', 'report'].forEach(k => { $(k).hidden = k !== id; }); }
function problem([t, x]) { $('problemTitle').textContent = t; $('problemText').textContent = x; show('problem'); }

/* ---------------- employee form ---------------- */
function renderFill() {
  if (!data.open) { problem(ui().closed); return; }
  $('fillCompany').textContent = data.company || '';
  $('fillTitle').textContent = data.title;
  $('fillSub').textContent = ui().fillSub(data.product);
  const picked = document.querySelector('input[name="size"]:checked')?.value;
  $('szOptions').innerHTML = data.sizes.map(s =>
    `<label class="sz-opt"><input type="radio" name="size" value="${esc(s)}"${s === picked ? ' checked' : ''}><span translate="no">${esc(s)}</span></label>`).join('');
  show('fill');
}

$('sizeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const E = ui().err;
  const name = $('szName'), qty = $('szQty');
  const size = document.querySelector('input[name="size"]:checked');
  const mark = (el, msg) => { const f = el.closest('.field'); f.classList.toggle('bad', !!msg); f.querySelector('.err').textContent = msg || ''; el.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  mark(name, name.value.trim().length < 2 ? E.name : '');
  $('szSizeErr').textContent = size ? '' : E.size;
  const q = Number(qty.value);
  mark(qty, !(q >= 1 && q <= 50) ? E.qty : '');
  const bad = name.value.trim().length < 2 ? name : !size ? $('szOptions').querySelector('input') : !(q >= 1 && q <= 50) ? qty : null;
  if (bad) { bad.focus(); return; }
  const btn = $('szSubmit');
  btn.disabled = true;
  btn.querySelector('span').textContent = ui().sending;
  $('szError').hidden = true;
  try {
    data = await rpc('add_size_entry', { p_token: listToken, p_person: name.value.trim(), p_size: size.value,
                                          p_qty: Math.floor(q), p_note: $('szNote').value.trim() || null });
    $('sizeForm').hidden = true;
    $('szDone').hidden = false;
    $('szDoneText').textContent = ui().doneText(data.count);
    $('szDone').focus();
  } catch (err) {
    if (err.code === 'closed') { problem(ui().closed); return; }
    $('szError').textContent = E.generic;
    $('szError').hidden = false;
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = ui().send;
  }
});
$('szAgain').addEventListener('click', () => {
  $('sizeForm').reset();
  $('szQty').value = 1;
  $('sizeForm').hidden = false;
  $('szDone').hidden = true;
  $('szName').focus();
});

/* ---------------- client's report ---------------- */
function renderReport() {
  $('repCompany').textContent = data.company || '';
  $('repTitle').textContent = data.title;
  const entries = data.entries || [];
  const per = {};
  let pieces = 0;
  entries.forEach(e => { per[e.size] = (per[e.size] || 0) + e.qty; pieces += e.qty; });
  $('repTotals').innerHTML = `<p class="sz-big"><b>${esc(ui().total(pieces))}</b><span>${esc(ui().people(entries.length))}</span></p>` +
    `<ul class="sz-per">${data.sizes.map(s => `<li><b translate="no">${esc(s)}</b><span>${fmtNum(per[s] || 0)}</span></li>`).join('')}</ul>`;
  $('repRows').innerHTML = entries.map(e =>
    `<tr><td>${esc(e.person)}</td><td translate="no">${esc(e.size)}</td><td>${fmtNum(e.qty)}</td><td>${esc(e.note || '')}</td></tr>`).join('');
  $('repEmpty').hidden = entries.length > 0;
  const link = `${SITE_BASE}sizes.html?l=${data.token}`;
  $('shareLink').value = link;
  $('shareWa').href = `https://wa.me/?text=${encodeURIComponent(ui().waText(data.title, link))}`;
  show('report');
}

$('shareCopy').addEventListener('click', async (e) => {
  const t = e.currentTarget.querySelector('span');
  try { await navigator.clipboard.writeText($('shareLink').value); } catch (err) { $('shareLink').select(); return; }
  const old = t.textContent;
  t.textContent = ui().copied;
  setTimeout(() => { t.textContent = old; }, 1600);
});

$('repCsv').addEventListener('click', () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['name', 'size', 'pieces', 'note', 'added'];
  const rows = (data.entries || []).map(e => [e.person, e.size, e.qty, e.note || '', e.at].map(q).join(','));
  // BOM so Excel opens Arabic names correctly
  const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(data.company || data.title).replace(/[\\/:*?"<>|]+/g, ' ').trim()} sizes.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

async function loadReport() {
  try {
    data = await rpc('get_size_report', { p_admin_token: adminToken });
    data ? renderReport() : problem(ui().notFound);
  } catch (e) { problem(ui().notFound); }
}
$('repRefresh').addEventListener('click', loadReport);

document.addEventListener('langchange', () => {
  if (!data) return;
  if (!$('fill').hidden) renderFill();
  if (!$('report').hidden) renderReport();
  if (!$('szDone').hidden) $('szDoneText').textContent = ui().doneText(data.count);
});

(async () => {
  if (!listToken && !adminToken) { problem(ui().notFound); return; }
  if (!ready) { problem(ui().offline); return; }
  if (adminToken) { await loadReport(); return; }
  try {
    data = await rpc('get_size_list', { p_token: listToken });
    data ? renderFill() : problem(ui().notFound);
  } catch (e) { problem(ui().notFound); }
})();
