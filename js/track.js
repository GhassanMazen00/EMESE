/* EMESE: a customer's order page. Opened from the secret link they got after ordering:
 * shows progress, the price, every design proof (approve or ask for changes) and the history. */
import { addStrings, ui, lang } from './i18n.js';
import { startPage, esc, fmtDate, fmtMoney, fmtNum, param, HEADER } from './page.js';
import { ready, rpc, publicUrl } from './api.js';
import { WHATSAPP_NUMBER } from './config.js';

document.getElementById('header').innerHTML = HEADER;

addStrings({
  'tr.lookupTitle': 'Track your order',
  'tr.lookupSub': 'Open the link you got when you sent the order. Orders sent from this device are listed here.',
  'tr.newOrder': 'Get a quote',
  'tr.loading': 'Getting your order…',
  'tr.home': 'Home page',
  'tr.stages': 'Order stages',
  'tr.proofTitle': 'Your design',
  'tr.quoteTitle': 'Price',
  'tr.details': 'Order details',
  'tr.history': 'What happened so far',
  'tr.help': 'Have a question?',
  'tr.helpLink': 'Message us on WhatsApp'
}, {
  ar: {
    trTitle: 'تابع طلبك | EMESE',
    stages: { new: 'وصلنا', quoted: 'السعر', proof: 'التصميم', approved: 'موافقتك', production: 'التنفيذ', ready: 'جاهز', delivered: 'اتسلّم' },
    status: {
      new: ['وصلنا طلبك', 'بنراجعه وهنبعتلك السعر وتصميم للموافقة.'],
      quoted: ['السعر جاهز', 'بنجهّز التصميم عشان تشوفه وتوافق عليه.'],
      proof: ['التصميم مستني موافقتك', 'بص على التصميم تحت، ووافق عليه أو قولنا تغيّر إيه.'],
      approved: ['وافقت على التصميم', 'هنبدأ التنفيذ ونبلغك أول ما يبقى جاهز.'],
      production: ['طلبك بيتنفّذ', 'المكن شغال على طلبك دلوقتي.'],
      ready: ['طلبك جاهز', 'هنكلّمك نتفق على الاستلام أو التوصيل.'],
      delivered: ['اتسلّم', 'شكرًا إنك اشتغلت معانا.'],
      cancelled: ['الطلب اتلغى', 'لو ده غلط، كلّمنا على واتساب.']
    },
    events: {
      created: 'الطلب وصل', quote: 'بعتنالك السعر', proof: (v) => `بعتنالك تصميم ${v}`, approved: 'وافقت على التصميم',
      changes: 'طلبت تعديل', status: (s) => `بقى: ${s}`, note: 'ملحوظة من الفريق'
    },
    proofV: (v) => `نسخة ${fmtNum(v)}`,
    approve: 'موافق، ابدأوا التنفيذ',
    changes: 'محتاج تعديل',
    changesPh: 'قولنا تغيّر إيه: مكان اللوجو، الحجم، اللون…',
    sendChanges: 'ابعت التعديل',
    cancel: 'إلغاء',
    approved: 'وافقت عليه',
    changed: 'طلبت تعديل',
    sending: 'بنبعت…',
    needComment: 'اكتب التعديل اللي محتاجه.',
    decideErr: 'ماقدرناش نسجّل ردّك. جرّب تاني.',
    fields: { product: 'المنتج', method: 'الطريقة', color: 'اللون', qty: 'الكمية', deadline: 'مطلوب يوم', company: 'الشركة',
              notes: 'ملاحظات', sizes: 'تجميع مقاسات', yes: 'أيوه', estimate: 'السعر التقريبي' },
    files: { logo: 'اللوجو اللي بعته', mockup: 'الموكب من الاستوديو' },
    notFound: ['مش لاقيين الطلب ده', 'اتأكد إنك فتحت اللينك كامل زي ما وصلك.'],
    offline: ['الطلبات مش متوصّلة لسه', 'الموقع لسه مش متوصّل بقاعدة البيانات. كلّمنا على واتساب ونبلغك بحالة طلبك.'],
    netErr: ['مفيش اتصال', 'اتأكد من النت وافتح الصفحة تاني.'],
    savedAt: (d) => `اتبعت ${d}`,
    waText: (code) => `أهلًا EMESE، عندي سؤال عن طلب ${code}`
  },
  en: {
    trTitle: 'Track your order | EMESE',
    stages: { new: 'Received', quoted: 'Price', proof: 'Design', approved: 'Approved', production: 'Making', ready: 'Ready', delivered: 'Delivered' },
    status: {
      new: ['We got your order', "We're reviewing it and will send a price and a design to approve."],
      quoted: ['Your price is ready', "We're preparing the design for you to approve."],
      proof: ['Your design is waiting for you', 'Look at the design below, then approve it or tell us what to change.'],
      approved: ['Design approved', "We're starting production and will tell you when it's ready."],
      production: ["We're making your order", 'The machines are on your order right now.'],
      ready: ['Your order is ready', "We'll call you to arrange pickup or delivery."],
      delivered: ['Delivered', 'Thank you for working with us.'],
      cancelled: ['Order cancelled', "If that's a mistake, message us on WhatsApp."]
    },
    events: {
      created: 'Order received', quote: 'Price sent', proof: (v) => `Design ${v} sent`, approved: 'You approved the design',
      changes: 'You asked for changes', status: (s) => `Now: ${s}`, note: 'Note from the team'
    },
    proofV: (v) => `Version ${v}`,
    approve: 'Approve, start production',
    changes: 'Ask for changes',
    changesPh: 'Tell us what to change: logo position, size, color…',
    sendChanges: 'Send changes',
    cancel: 'Cancel',
    approved: 'You approved this',
    changed: 'You asked for changes',
    sending: 'Sending…',
    needComment: 'Write the change you need.',
    decideErr: "Your answer didn't go through. Try again.",
    fields: { product: 'Product', method: 'Method', color: 'Color', qty: 'Quantity', deadline: 'Needed by', company: 'Company',
              notes: 'Notes', sizes: 'Collect sizes', yes: 'Yes', estimate: 'Estimated price' },
    files: { logo: 'Your logo', mockup: 'Studio mockup' },
    notFound: ["We can't find this order", 'Make sure you opened the full link you received.'],
    offline: ['Orders are not connected yet', "The site isn't connected to the order database yet. Message us on WhatsApp for your order's status."],
    netErr: ["You're offline", 'Check your connection and open the page again.'],
    savedAt: (d) => `Sent ${d}`,
    waText: (code) => `Hi EMESE, I have a question about order ${code}`
  }
});

startPage();
const $ = (id) => document.getElementById(id);
const token = param('o');
const STAGES = ['new', 'quoted', 'proof', 'approved', 'production', 'ready', 'delivered'];
let order = null;

function show(id) {
  ['lookup', 'loading', 'problem', 'order'].forEach(k => { $(k).hidden = k !== id; });
}

function problem([title, text]) {
  $('problemTitle').textContent = title;
  $('problemText').textContent = text;
  show('problem');
}

function savedList() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('emese-orders') || '[]'); } catch (e) { list = []; }
  $('savedOrders').innerHTML = list.map(o =>
    `<li><a href="track.html?o=${encodeURIComponent(o.token)}"><b translate="no">${esc(o.code)}</b><span>${esc(ui().savedAt(fmtDate(o.at)))}</span></a></li>`).join('');
  $('savedOrders').hidden = !list.length;
}

function render() {
  const t = ui();
  const o = order;
  document.title = `${o.code} | EMESE`;
  $('code').textContent = o.code;
  const [title, text] = t.status[o.status] || t.status.new;
  $('statusTitle').textContent = title;
  $('statusText').textContent = text;

  // progress: what's done, what's now
  const at = STAGES.indexOf(o.status);
  $('progress').hidden = o.status === 'cancelled';
  $('progress').innerHTML = STAGES.map((s, i) =>
    `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}><span>${esc(t.stages[s])}</span></li>`).join('');

  // proofs, newest first; only an undecided one can be answered
  const proofs = [...(o.proofs || [])].reverse();
  $('proofBlock').hidden = !proofs.length;
  $('proofs').innerHTML = proofs.map((p, i) => `
    <figure class="proof-card${i ? ' old' : ''}" data-id="${esc(p.id)}">
      <a href="${esc(publicUrl(p.image_path))}" target="_blank" rel="noopener"><img src="${esc(publicUrl(p.image_path))}" alt="${esc(t.proofV(p.version))}" loading="lazy" width="800" height="800"></a>
      <figcaption>
        <b>${esc(t.proofV(p.version))}</b> <span class="muted-date">${esc(fmtDate(p.at))}</span>
        ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        ${p.decision === 'approved' ? `<p class="decided ok">${esc(t.approved)}</p>` : ''}
        ${p.decision === 'changes' ? `<p class="decided">${esc(t.changed)}${p.decision_comment ? `: ${esc(p.decision_comment)}` : ''}</p>` : ''}
        ${!p.decision && i === 0 && o.status !== 'cancelled' ? `
          <div class="decide">
            <button type="button" class="btn btn-ink" data-act="approve">${esc(t.approve)}</button>
            <button type="button" class="btn btn-ghost" data-act="changes">${esc(t.changes)}</button>
          </div>
          <form class="changes-form" hidden>
            <label class="field"><span class="visually-hidden">${esc(t.changes)}</span><textarea rows="3" name="comment" placeholder="${esc(t.changesPh)}"></textarea><small class="err"></small></label>
            <div class="decide">
              <button type="submit" class="btn btn-ink">${esc(t.sendChanges)}</button>
              <button type="button" class="btn btn-ghost" data-act="cancel">${esc(t.cancel)}</button>
            </div>
          </form>
          <p class="form-error" role="alert" hidden></p>` : ''}
      </figcaption>
    </figure>`).join('');

  // price
  $('quoteBlock').hidden = o.quote_amount == null;
  $('quoteAmount').textContent = o.quote_amount == null ? '' : fmtMoney(o.quote_amount);
  $('quoteNote').textContent = o.quote_note || '';

  // details
  const f = t.fields;
  const rows = [];
  (o.items || []).forEach(it => {
    rows.push([f.product, it.product_name]);
    if (it.method_name) rows.push([f.method, it.method_name]);
    if (it.color_name) rows.push([f.color, it.color_name]);
    rows.push([f.qty, fmtNum(it.qty)]);
    if (it.collect_sizes) rows.push([f.sizes, f.yes]);
  });
  if (o.deadline) rows.push([f.deadline, fmtDate(o.deadline, { dateStyle: 'long' })]);
  if (o.company) rows.push([f.company, o.company]);
  if (o.estimate && o.estimate.min) rows.push([f.estimate, `${fmtMoney(o.estimate.min, o.estimate.currency)} / ${fmtMoney(o.estimate.max, o.estimate.currency)}`]);
  if (o.notes) rows.push([f.notes, o.notes]);
  $('details').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('files').innerHTML = [['logo_path', t.files.logo], ['mockup_path', t.files.mockup]].filter(([k]) => o[k])
    .map(([k, label]) => `<a href="${esc(publicUrl(o[k]))}" target="_blank" rel="noopener"><img src="${esc(publicUrl(o[k]))}" alt="" width="96" height="96" loading="lazy"><span>${esc(label)}</span></a>`).join('');

  // history, newest first
  const ev = t.events;
  let proofN = 0;
  const items = (o.events || []).map(e => {
    let label = '';
    if (e.kind === 'proof') label = ev.proof(fmtNum(++proofN));
    else if (e.kind === 'status') label = ev.status(t.stages[e.status] || (t.status[e.status] || [e.status])[0]);
    else label = ev[e.kind] || e.kind;
    return `<li><time datetime="${esc(e.at)}">${esc(fmtDate(e.at, { dateStyle: 'medium', timeStyle: 'short' }))}</time><span>${esc(label)}</span>${e.message && e.kind !== 'quote' ? `<p>${esc(e.message)}</p>` : ''}</li>`;
  }).reverse();
  $('history').innerHTML = items.join('');
  $('waHelp').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.waText(o.code))}`;
  show('order');
}

async function decide(card, decision, comment) {
  const err = card.querySelector('.form-error');
  err.hidden = true;
  card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    order = await rpc('decide_proof', { p_token: token, p_proof: card.dataset.id, p_decision: decision, p_comment: comment || null });
    render();
    $('statusTitle').focus?.();
  } catch (e) {
    card.querySelectorAll('button').forEach(b => { b.disabled = false; });
    err.textContent = e.code === 'comment_required' ? ui().needComment : ui().decideErr;
    err.hidden = false;
  }
}

$('proofs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const card = b.closest('.proof-card');
  const form = card.querySelector('.changes-form');
  if (b.dataset.act === 'approve') decide(card, 'approved');
  if (b.dataset.act === 'changes') { form.hidden = false; card.querySelector('.decide').hidden = true; form.querySelector('textarea').focus(); }
  if (b.dataset.act === 'cancel') { form.hidden = true; card.querySelector('.decide').hidden = false; }
});
$('proofs').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const card = form.closest('.proof-card');
  const ta = form.querySelector('textarea');
  if (!ta.value.trim()) {
    form.querySelector('.err').textContent = ui().needComment;
    ta.setAttribute('aria-invalid', 'true');
    ta.focus();
    return;
  }
  decide(card, 'changes', ta.value.trim());
});

document.addEventListener('langchange', () => { if (order) render(); else if (!$('lookup').hidden) savedList(); });

async function load() {
  if (!token) { savedList(); show('lookup'); return; }
  if (!ready) { problem(ui().offline); return; }
  show('loading');
  try {
    order = await rpc('get_order', { p_token: token });
    if (!order) { problem(ui().notFound); return; }
    render();
  } catch (e) {
    problem(e.code === 'network' ? ui().netErr : ui().notFound);
  }
}
load();
// pick up the team's changes when the customer comes back to the tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && order && token && ready) {
    rpc('get_order', { p_token: token }).then(o => { if (o) { order = o; render(); } }).catch(() => {});
  }
});
void lang;
