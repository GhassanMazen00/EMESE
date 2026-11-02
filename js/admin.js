/* EMESE: the team dashboard. Staff sign in (Supabase auth, accounts listed in public.staff),
 * see every order, set its status and price, upload design proofs, and run size lists. */
import { addStrings, ui } from './i18n.js';
import { startPage, esc, fmtDate, fmtMoney, fmtNum, HEADER } from './page.js';
import { ready, select, insert, update, upload, publicUrl, signIn, signOut, staffToken, staffEmail } from './api.js';
import { SITE_BASE } from './config.js';

document.getElementById('header').innerHTML = HEADER;

addStrings({
  'ad.setupTitle': 'The team dashboard needs the database',
  'ad.setupText': 'Orders still go to WhatsApp only. To turn the dashboard on: create a Supabase project, run supabase/migrations, and put the project URL and key in js/config.js. The README has every step.',
  'ad.bulkOnly': 'Bulk names (works without the database)',
  'ad.loginTitle': 'Team sign-in',
  'ad.email': 'Email',
  'ad.password': 'Password',
  'ad.signIn': 'Sign in',
  'ad.sections': 'Dashboard sections',
  'ad.orders': 'Orders',
  'ad.sizeLists': 'Size lists',
  'ad.bulk': 'Bulk names',
  'ad.signOut': 'Sign out',
  'ad.search': 'Search',
  'ad.searchPh': 'Order number, name, phone, company…',
  'ad.noOrders': 'No orders here.',
  'ad.colCode': 'Order',
  'ad.colCustomer': 'Customer',
  'ad.colItem': 'Items',
  'ad.colStatus': 'Status',
  'ad.colDate': 'Date',
  'ad.back': 'All orders',
  'ad.proofs': 'Designs',
  'ad.newProof': 'Send a design for approval',
  'ad.proofFile': 'Design image',
  'ad.proofNote': 'Note for the customer',
  'ad.sendProof': 'Upload and send',
  'ad.status': 'Status',
  'ad.save': 'Save',
  'ad.quote': 'Price',
  'ad.amount': 'Amount (EGP)',
  'ad.quoteNote': 'Price details',
  'ad.saveQuote': 'Save price',
  'ad.customerLink': "Customer's link",
  'ad.waCustomer': 'Send it on WhatsApp',
  'ad.makeSizes': 'Make a size list for this order',
  'ad.newList': 'New size list',
  'ad.listTitle': 'Title',
  'ad.listTitlePh': 'Maadi branch uniforms',
  'ad.company': 'Company',
  'ad.product': 'Product',
  'ad.productPh': 'Long-sleeve polo',
  'ad.sizesField': 'Sizes (separate with commas)',
  'ad.create': 'Create the list'
}, {
  ar: {
    adTitle: 'لوحة الفريق | EMESE',
    all: 'الكل',
    statuses: { new: 'جديد', quoted: 'اتبعت السعر', proof: 'مستني موافقة', approved: 'اتوافق عليه', production: 'بيتنفّذ', ready: 'جاهز', delivered: 'اتسلّم', cancelled: 'اتلغى' },
    events: { created: 'الطلب وصل', quote: 'السعر اتبعت', proof: 'تصميم اتبعت', approved: 'العميل وافق', changes: 'العميل طلب تعديل', status: 'الحالة', note: 'ملحوظة' },
    pieces: (n) => `${fmtNum(n)} قطعة`,
    proofV: (v) => `نسخة ${fmtNum(v)}`,
    waiting: 'مستني رد العميل',
    approvedBy: 'العميل وافق',
    changesBy: 'العميل طلب تعديل',
    saved: 'اتحفظ',
    uploading: 'بنرفع…',
    login: { bad: 'الإيميل أو الباسورد غلط.', notStaff: 'الحساب ده مش من الفريق. اطلب من المسؤول يضيفه.', generic: 'ماقدرناش ندخلك. جرّب تاني.' },
    needFile: 'اختار صورة التصميم.',
    failed: 'العملية ماتمتش. جرّب تاني.',
    listLinks: { fill: 'لينك الموظفين', report: 'لينك العميل (القايمة كاملة)' },
    entries: (n) => `${fmtNum(n)} تسجيل`,
    open: 'مفتوحة', closed: 'مقفولة', close: 'اقفلها', reopen: 'افتحها',
    waOrder: (name, code, link) => `أهلًا ${name}، تقدر تتابع طلب ${code} وتوافق على التصميم من هنا: ${link}`,
    copied: 'اتنسخ',
    copy: 'انسخ',
    fields: { product: 'المنتج', qty: 'الكمية', sizes: 'تجميع مقاسات', yes: 'أيوه', deadline: 'مطلوب يوم', estimate: 'السعر التقريبي',
              lang: 'لغة العميل', notes: 'ملاحظات', logo: 'اللوجو', mockup: 'الموكب' },
    listFor: (code) => `مقاسات طلب ${code}`
  },
  en: {
    adTitle: 'Team dashboard | EMESE',
    all: 'All',
    statuses: { new: 'New', quoted: 'Price sent', proof: 'Waiting approval', approved: 'Approved', production: 'In production', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' },
    events: { created: 'Order received', quote: 'Price sent', proof: 'Design sent', approved: 'Customer approved', changes: 'Customer asked for changes', status: 'Status', note: 'Note' },
    pieces: (n) => `${n} pcs`,
    proofV: (v) => `Version ${v}`,
    waiting: 'Waiting for the customer',
    approvedBy: 'Customer approved',
    changesBy: 'Customer asked for changes',
    saved: 'Saved',
    uploading: 'Uploading…',
    login: { bad: 'Wrong email or password.', notStaff: "This account isn't on the team. Ask an admin to add it.", generic: "We couldn't sign you in. Try again." },
    needFile: 'Pick the design image.',
    failed: "That didn't work. Try again.",
    listLinks: { fill: "Employees' link", report: "Client's link (full list)" },
    entries: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    open: 'Open', closed: 'Closed', close: 'Close it', reopen: 'Reopen',
    waOrder: (name, code, link) => `Hi ${name}, you can follow order ${code} and approve the design here: ${link}`,
    copied: 'Copied',
    copy: 'Copy',
    fields: { product: 'Product', qty: 'Quantity', sizes: 'Collect sizes', yes: 'Yes', deadline: 'Needed by', estimate: 'Estimated price',
              lang: "Customer's language", notes: 'Notes', logo: 'Logo', mockup: 'Mockup' },
    listFor: (code) => `Sizes for order ${code}`
  }
});

startPage();
const $ = (id) => document.getElementById(id);
const STATUSES = ['new', 'quoted', 'proof', 'approved', 'production', 'ready', 'delivered', 'cancelled'];
let orders = [];
let filter = 'all';
let current = null;     // the open order, with its proofs and events

function view(id) { ['setup', 'login', 'app'].forEach(k => { $(k).hidden = k !== id; }); }
async function tok() {
  const t = await staffToken();
  if (!t) { view('login'); throw new Error('signed_out'); }
  return t;
}

/* ---------------- sign in ---------------- */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('lgError');
  err.hidden = true;
  const btn = $('lgSubmit');
  btn.disabled = true;
  try {
    await signIn($('lgEmail').value.trim(), $('lgPass').value);
    const me = await select('staff', 'select=user_id&limit=1', await staffToken());
    if (!me || !me.length) { await signOut(); throw Object.assign(new Error('not_staff'), { code: 'not_staff' }); }
    $('lgPass').value = '';
    start();
  } catch (x) {
    const L = ui().login;
    err.textContent = x.code === 'not_staff' ? L.notStaff : /invalid|credentials|400/i.test(String(x.code)) ? L.bad : L.generic;
    err.hidden = false;
  } finally { btn.disabled = false; }
});
$('signOut').addEventListener('click', async () => { await signOut(); view('login'); });

/* ---------------- routing ---------------- */
function route() {
  const h = location.hash.slice(1) || 'orders';
  const [tab, id] = h.split('/');
  document.querySelectorAll('.ad-tabs a[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  $('ordersView').hidden = !(tab === 'orders' && !id);
  $('orderView').hidden = !(tab === 'orders' && id);
  $('sizesView').hidden = tab !== 'sizes';
  if (tab === 'orders' && id) openOrder(id);
  else if (tab === 'orders') loadOrders();
  else if (tab === 'sizes') loadLists();
}
addEventListener('hashchange', route);

/* ---------------- orders list ---------------- */
function itemsText(o) {
  return (o.items || []).map(it => `${it.product_name} (${ui().pieces(it.qty)})`).join('، ');
}
function renderOrders() {
  const S = ui().statuses;
  $('statusFilter').innerHTML = [['all', ui().all], ...STATUSES.map(s => [s, S[s]])].map(([k, label]) => {
    const n = k === 'all' ? orders.length : orders.filter(o => o.status === k).length;
    return `<button type="button" class="ev-chip" data-s="${k}" aria-pressed="${k === filter}">${esc(label)}<small>${fmtNum(n)}</small></button>`;
  }).join('');
  const q = $('q').value.trim().toLowerCase();
  const list = orders.filter(o => (filter === 'all' || o.status === filter) &&
    (!q || [o.code, o.customer_name, o.phone, o.company, itemsText(o)].some(v => String(v || '').toLowerCase().includes(q))));
  $('ordersRows').innerHTML = list.map(o => `
    <tr>
      <td><a href="#orders/${esc(o.id)}" translate="no"><b>${esc(o.code)}</b></a></td>
      <td>${esc(o.customer_name)}${o.company ? `<small>${esc(o.company)}</small>` : ''}<small dir="ltr">${esc(o.phone)}</small></td>
      <td>${esc(itemsText(o))}</td>
      <td><span class="badge s-${esc(o.status)}">${esc(S[o.status] || o.status)}</span></td>
      <td>${esc(fmtDate(o.created_at))}</td>
    </tr>`).join('');
  $('ordersEmpty').hidden = list.length > 0;
}
async function loadOrders() {
  try {
    orders = await select('orders', 'select=id,code,status,customer_name,phone,company,items,created_at&order=created_at.desc&limit=500', await tok());
    renderOrders();
  } catch (e) { /* signed out */ }
}
$('statusFilter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.s; renderOrders(); } });
$('q').addEventListener('input', renderOrders);

/* ---------------- one order ---------------- */
async function openOrder(id) {
  try {
    const t = await tok();
    const [o] = await select('orders', `id=eq.${encodeURIComponent(id)}&select=*`, t);
    if (!o) { location.hash = '#orders'; return; }
    const [proofs, events] = await Promise.all([
      select('proofs', `order_id=eq.${o.id}&order=version.desc`, t),
      select('order_events', `order_id=eq.${o.id}&order=created_at.desc`, t)
    ]);
    current = { ...o, proofs, events };
    renderOrder();
  } catch (e) { /* signed out */ }
}
function renderOrder() {
  const o = current, T = ui();
  document.title = `${o.code} | EMESE`;
  $('oCode').textContent = o.code;
  $('oCustomer').textContent = o.customer_name + (o.company ? ` / ${o.company}` : '');
  $('oContact').innerHTML = [`<a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a>`, o.email ? `<a href="mailto:${esc(o.email)}" dir="ltr">${esc(o.email)}</a>` : '', esc(o.city || '')]
    .filter(Boolean).join('، ');
  const F = T.fields, rows = [];
  (o.items || []).forEach(it => {
    rows.push([F.product, `${it.product_name}${it.method_name ? `، ${it.method_name}` : ''}${it.color_name ? `، ${it.color_name}` : ''}`]);
    rows.push([F.qty, T.pieces(it.qty)]);
    if (it.collect_sizes) rows.push([F.sizes, F.yes]);
  });
  if (o.deadline) rows.push([F.deadline, fmtDate(o.deadline, { dateStyle: 'long' })]);
  if (o.estimate && o.estimate.min) rows.push([F.estimate, `${fmtMoney(o.estimate.min)} / ${fmtMoney(o.estimate.max)}`]);
  rows.push([F.lang, o.lang === 'en' ? 'English' : 'عربي']);
  if (o.notes) rows.push([F.notes, o.notes]);
  $('oDetails').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('oFiles').innerHTML = ['logo_path', 'mockup_path'].filter(k => o[k]).map(k =>
    `<a href="${esc(publicUrl(o[k]))}" target="_blank" rel="noopener" download><img src="${esc(publicUrl(o[k]))}" alt="" width="96" height="96"><span>${esc(k === 'logo_path' ? F.logo : F.mockup)}</span></a>`).join('');
  $('oProofs').innerHTML = o.proofs.map(p => `
    <figure><a href="${esc(publicUrl(p.image_path))}" target="_blank" rel="noopener"><img src="${esc(publicUrl(p.image_path))}" alt="" width="240" height="240" loading="lazy"></a>
      <figcaption><b>${esc(T.proofV(p.version))}</b>
        <span class="${p.decision === 'approved' ? 'ok' : p.decision ? 'warn' : ''}">${esc(p.decision === 'approved' ? T.approvedBy : p.decision ? T.changesBy : T.waiting)}</span>
        ${p.decision_comment ? `<q>${esc(p.decision_comment)}</q>` : ''}</figcaption></figure>`).join('');
  $('oStatus').innerHTML = STATUSES.map(s => `<option value="${s}"${s === o.status ? ' selected' : ''}>${esc(T.statuses[s])}</option>`).join('');
  $('qAmount').value = o.quote_amount ?? '';
  $('qNote').value = o.quote_note || '';
  const link = `${SITE_BASE}track.html?o=${o.token}`;
  $('oLink').value = link;
  const phone = String(o.phone).replace(/\D/g, '').replace(/^0/, '20');
  $('oWa').href = `https://wa.me/${phone}?text=${encodeURIComponent(T.waOrder(o.customer_name, o.code, link))}`;
  $('oHistory').innerHTML = o.events.map(e => `<li><time>${esc(fmtDate(e.created_at, { dateStyle: 'medium', timeStyle: 'short' }))}</time><span>${esc(T.events[e.kind] || e.kind)}${e.kind === 'status' ? `: ${esc(T.statuses[e.status] || e.status)}` : ''}</span>${e.message ? `<p>${esc(e.message)}</p>` : ''}</li>`).join('');
}

function flash(btn, ok) {
  const span = btn.querySelector('span');
  const old = span.textContent;
  span.textContent = ok ? ui().saved : ui().failed;
  setTimeout(() => { span.textContent = old; }, 1600);
}
$('statusForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button');
  try { await update('orders', `id=eq.${current.id}`, { status: $('oStatus').value }, await tok()); flash(btn, true); openOrder(current.id); }
  catch (x) { flash(btn, false); }
});
$('quoteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button');
  const amount = $('qAmount').value === '' ? null : Number($('qAmount').value);
  const patch = { quote_amount: amount, quote_note: $('qNote').value.trim() || null };
  if (amount != null && current.status === 'new') patch.status = 'quoted';
  try { await update('orders', `id=eq.${current.id}`, patch, await tok()); flash(btn, true); openOrder(current.id); }
  catch (x) { flash(btn, false); }
});
$('proofForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, err = form.querySelector('.form-error'), btn = form.querySelector('button[type="submit"]');
  const file = $('pFile').files[0];
  err.hidden = true;
  if (!file) { err.textContent = ui().needFile; err.hidden = false; $('pFile').focus(); return; }
  btn.disabled = true;
  const span = btn.querySelector('span'), old = span.textContent;
  span.textContent = ui().uploading;
  try {
    const t = await tok();
    const version = (current.proofs[0]?.version || 0) + 1;
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `proofs/${current.id}/v${version}-${Date.now()}.${ext}`;
    await upload(path, file, t);
    await insert('proofs', { order_id: current.id, version, image_path: path, note: $('pNote').value.trim() || null }, t);
    form.reset();
    openOrder(current.id);
  } catch (x) {
    err.textContent = ui().failed;
    err.hidden = false;
  } finally { btn.disabled = false; span.textContent = old; }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText($(b.dataset.copy).value); } catch (x) { $(b.dataset.copy).select(); return; }
  const span = b.querySelector('span'), old = span.textContent;
  span.textContent = ui().copied;
  setTimeout(() => { span.textContent = old; }, 1600);
});
$('oMakeSizes').addEventListener('click', async () => {
  const it = (current.items || [])[0] || {};
  try {
    await insert('size_lists', { order_id: current.id, title: ui().listFor(current.code), company: current.company || current.customer_name,
                                 product: it.product_name || null }, await tok());
    location.hash = '#sizes';
  } catch (x) { /* shown by the list view */ }
});

/* ---------------- size lists ---------------- */
async function loadLists() {
  try {
    const t = await tok();
    const lists = await select('size_lists', 'select=*,size_entries(count)&order=created_at.desc&limit=200', t);
    const T = ui();
    $('sizeLists').innerHTML = lists.map(l => {
      const n = l.size_entries && l.size_entries[0] ? l.size_entries[0].count : 0;
      return `<li class="ad-box">
        <div class="ad-list-head"><b>${esc(l.title)}</b><span class="badge ${l.open ? 's-approved' : 's-cancelled'}">${esc(l.open ? T.open : T.closed)}</span></div>
        <p class="sub">${esc([l.company, l.product].filter(Boolean).join('، '))}${l.company || l.product ? '، ' : ''}${esc(T.entries(n))}</p>
        <label class="field"><span>${esc(T.listLinks.fill)}</span><div class="share-row"><input id="f-${l.id}" readonly dir="ltr" value="${esc(`${SITE_BASE}sizes.html?l=${l.token}`)}"><button type="button" class="btn btn-ghost btn-sm" data-copy="f-${l.id}"><span>${esc(T.copy)}</span></button></div></label>
        <label class="field"><span>${esc(T.listLinks.report)}</span><div class="share-row"><input id="r-${l.id}" readonly dir="ltr" value="${esc(`${SITE_BASE}sizes.html?a=${l.admin_token}`)}"><button type="button" class="btn btn-ghost btn-sm" data-copy="r-${l.id}"><span>${esc(T.copy)}</span></button></div></label>
        <div class="report-actions"><a class="btn btn-ink btn-sm" href="sizes.html?a=${esc(l.admin_token)}" target="_blank" rel="noopener">${esc(T.listLinks.report)}</a>
        <button type="button" class="btn btn-ghost btn-sm" data-toggle="${esc(l.id)}" data-open="${l.open}">${esc(l.open ? T.close : T.reopen)}</button></div>
      </li>`;
    }).join('');
  } catch (e) { /* signed out */ }
}
$('sizeLists').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-toggle]');
  if (!b) return;
  try { await update('size_lists', `id=eq.${b.dataset.toggle}`, { open: b.dataset.open !== 'true' }, await tok()); loadLists(); }
  catch (x) { /* ignore */ }
});
$('sizeListForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('slTitle');
  const f = title.closest('.field');
  f.classList.toggle('bad', title.value.trim().length < 2);
  if (title.value.trim().length < 2) { title.focus(); return; }
  const sizes = $('slSizes').value.split(',').map(s => s.trim()).filter(Boolean);
  try {
    await insert('size_lists', { title: title.value.trim(), company: $('slCompany').value.trim() || null,
                                 product: $('slProduct').value.trim() || null, sizes: sizes.length ? sizes : undefined }, await tok());
    e.target.reset();
    $('slSizes').value = 'XS, S, M, L, XL, XXL, 3XL';
    loadLists();
  } catch (x) { /* signed out */ }
});

document.addEventListener('langchange', () => {
  if (!$('app').hidden) {
    if (!$('ordersView').hidden) renderOrders();
    if (!$('orderView').hidden && current) renderOrder();
    if (!$('sizesView').hidden) loadLists();
  }
});

function start() {
  view('app');
  $('who').textContent = staffEmail() || '';
  route();
}

(async () => {
  if (!ready) { view('setup'); return; }
  (await staffToken()) ? start() : view('login');
})();
