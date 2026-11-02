/* EMESE: the quote / order form. Saves the order (when the database is connected) and hands the
 * customer a tracking link; otherwise, or as well, it opens a ready WhatsApp message. */
import { PRODUCTS, TECHS, COLOR_NAMES, CATS, byId } from './catalog.js';
import { lang, ui, addStrings } from './i18n.js';
import { ready, rpc, upload } from './api.js';
import { WHATSAPP_NUMBER, SITE_BASE } from './config.js';
import { estimate } from './pricing.js';
import { getLogo, logoBlob, readLogoFile, setLogo, clearLogo } from './logo.js';

addStrings({
  'order.title': 'Get a quote',
  'order.sub': "Tell us what you need and how many. We send you the price and a design to approve before anything is made.",
  'order.how1': 'You send the order',
  'order.how2': 'We send the price and the design',
  'order.how3': 'You approve, we make it',
  'order.what': 'The product',
  'order.product': 'Product',
  'order.other': 'Which product?',
  'order.otherPh': 'e.g. bucket hats, wooden coasters…',
  'order.method': 'Method',
  'order.color': 'Color',
  'order.qty': 'Quantity',
  'order.deadline': 'Needed by',
  'order.sizes': 'Send me a link to collect sizes from my team',
  'order.design': 'Your design',
  'order.logoAdd': 'Add your logo',
  'order.logoHint': 'PNG with a transparent background works best. You can also send it later.',
  'order.logoChange': 'Change',
  'order.logoRemove': 'Remove',
  'order.mockup': 'Mockup from the studio',
  'order.you': 'Your details',
  'order.name': 'Name',
  'order.phone': 'Phone (WhatsApp)',
  'order.company': 'Company',
  'order.email': 'Email',
  'order.city': 'City',
  'order.optional': 'optional',
  'order.notes': 'Anything else',
  'order.notesPh': 'Logo position, colors, sizes, packaging…',
  'order.doneTitle': 'Order received',
  'order.track': 'Track your order',
  'order.copy': 'Copy link',
  'order.waToo': 'Message us on WhatsApp',
  'order.another': 'New order',
  'order.estimate': 'Estimated price'
}, {
  ar: {
    unsure: 'مش متأكد، رشّحولي',
    otherProduct: 'منتج تاني',
    otherColor: 'لون تاني (اكتبه في الملاحظات)',
    sending: 'بنبعت الطلب…',
    send: 'ابعت الطلب',
    sendWa: 'ابعت على واتساب',
    range: (a, b) => `من ${a} لحد ${b}`,
    copied: 'اتنسخ',
    estimateNote: 'سعر تقريبي. السعر النهائي بيوصلك مع التصميم.',
    noEstimate: 'السعر النهائي بيوصلك من فريقنا بعد ما نشوف الطلب.',
    doneSaved: (code) => `رقم طلبك ${code}. احتفظ باللينك ده، هتلاقي عليه السعر والتصميم وتوافق عليه من غير ما تكلّم حد.`,
    doneWa: 'اتفتحتلك رسالة واتساب جاهزة. ابعتها وهنرد عليك بالسعر والتصميم.',
    err: {
      name: 'اكتب اسمك (حرفين على الأقل).',
      phone: 'اكتب رقم موبايل صحيح، مثلًا 01001234567.',
      qty: 'اكتب الكمية بالأرقام.',
      other: 'اكتب اسم المنتج.',
      too_many_requests: 'بعتّ طلبات كتير ورا بعض. استنى دقايق وجرّب تاني.',
      network: 'مفيش اتصال بالإنترنت. اتأكد من النت وجرّب تاني.',
      generic: 'الطلب مااتبعتش. جرّب تاني، أو ابعتهولنا على واتساب.',
      logo: 'اختار صورة PNG أو JPG أو SVG أو WebP.'
    },
    wa: { hi: 'أهلًا EMESE 👋', order: 'طلب', product: 'المنتج', qty: 'الكمية', deadline: 'مطلوب يوم', name: 'الاسم',
          company: 'الشركة', city: 'المدينة', notes: 'ملاحظات', sizes: 'محتاج لينك لتجميع المقاسات', track: 'تابع الطلب',
          logo: 'هبعتلكم اللوجو هنا' }
  },
  en: {
    unsure: 'Not sure, suggest one',
    otherProduct: 'Another product',
    otherColor: 'Another color (add it in the notes)',
    sending: 'Sending the order…',
    send: 'Send the order',
    sendWa: 'Send on WhatsApp',
    range: (a, b) => `${a} to ${b}`,
    copied: 'Copied',
    estimateNote: 'Approximate. The final price comes with your design.',
    noEstimate: 'Our team sends the final price once we see your order.',
    doneSaved: (code) => `Your order number is ${code}. Keep this link: it shows your price and design, and you can approve it right there.`,
    doneWa: "A ready WhatsApp message just opened. Send it and we'll reply with a price and a design.",
    err: {
      name: 'Add your name (2 letters or more).',
      phone: 'Add a valid mobile number, e.g. 01001234567.',
      qty: 'Add the quantity as a number.',
      other: 'Add the product name.',
      too_many_requests: 'Several orders were sent in a row. Wait a few minutes and try again.',
      network: "You're offline. Check your connection and try again.",
      generic: "The order didn't go through. Try again, or send it on WhatsApp.",
      logo: 'Pick a PNG, JPG, SVG or WebP image.'
    },
    wa: { hi: 'Hi EMESE 👋', order: 'Order', product: 'Product', qty: 'Quantity', deadline: 'Needed by', name: 'Name',
          company: 'Company', city: 'City', notes: 'Notes', sizes: 'Needs a link to collect sizes', track: 'Track the order',
          logo: "I'll send the logo here" }
  }
});

const form = document.getElementById('orderForm');
if (form) init();

function init() {
  const $ = (id) => document.getElementById(id);
  const f = {
    product: $('orderProduct'), other: $('orderOther'), method: $('orderMethod'), color: $('orderColor'),
    qty: $('orderQty'), deadline: $('orderDeadline'), sizes: $('orderSizes'), name: $('orderName'),
    phone: $('orderPhone'), company: $('orderCompany'), email: $('orderEmail'), city: $('orderCity'), notes: $('orderNotes')
  };
  const done = $('orderDone');
  const submit = $('orderSubmit');
  const errBox = $('orderError');
  const est = $('orderEstimate');
  let mockup = null;          // { blob, url, label } from the studio

  const L = () => (lang() === 'en' ? 'en' : 'ar');
  const nameOf = (hex) => (COLOR_NAMES[hex] ? COLOR_NAMES[hex][L() === 'en' ? 1 : 0] : hex);
  const today = new Date();
  f.deadline.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  /* ---------------- selects ---------------- */
  function fillProducts() {
    const keep = f.product.value || 'polo';
    f.product.innerHTML = CATS.map(c => `<optgroup label="${ui().cats[c]}">${PRODUCTS.filter(p => p.cat === c)
      .map(p => `<option value="${p.id}">${p[L()]}</option>`).join('')}</optgroup>`).join('') +
      `<option value="other">${ui().otherProduct}</option>`;
    f.product.value = keep;
  }
  function fillDependents() {
    const def = byId(f.product.value);
    const isOther = !def;
    f.other.closest('.field').hidden = !isOther;
    f.other.required = isOther;
    const keepM = f.method.value, keepC = f.color.value;
    const techs = def ? def.techs : Object.keys(TECHS);
    f.method.innerHTML = techs.map(t => `<option value="${t}">${TECHS[t][L()]}</option>`).join('') +
      `<option value="unsure">${ui().unsure}</option>`;
    f.method.value = techs.includes(keepM) || keepM === 'unsure' ? keepM : techs[0];
    const colors = def ? def.colors : [];
    f.color.closest('.field').hidden = isOther || colors.length === 0;
    f.color.innerHTML = colors.map(c => `<option value="${c}">${nameOf(c)}</option>`).join('') +
      `<option value="other">${ui().otherColor}</option>`;
    f.color.value = colors.includes(keepC) || keepC === 'other' ? keepC : (colors[0] || 'other');
    f.sizes.closest('.check').hidden = !(def && def.cat === 'apparel');
    updateEstimate();
  }

  function updateEstimate() {
    const e = estimate(f.product.value, f.method.value, f.qty.value);
    const fmt = (n) => new Intl.NumberFormat(L() === 'en' ? 'en-EG' : 'ar-EG', { style: 'currency', currency: e.currency, maximumFractionDigits: 0 }).format(n);
    if (e) {
      est.hidden = false;
      est.querySelector('.est-value').textContent = ui().range(fmt(e.min), fmt(e.max));
      est.querySelector('.est-note').textContent = ui().estimateNote;
    } else {
      est.hidden = false;
      est.querySelector('.est-value').textContent = '';
      est.querySelector('.est-note').textContent = ui().noEstimate;
    }
    est.classList.toggle('has', !!e);
  }

  /* ---------------- logo and mockup ---------------- */
  const logoThumb = $('orderLogoThumb'), logoFile = $('orderLogoFile'), logoRemove = $('orderLogoRemove');
  const mockBox = $('orderMockup');
  function showLogo() {
    const l = getLogo();
    logoThumb.hidden = !l;
    logoRemove.hidden = !l;
    $('orderLogoAddText').hidden = !!l;
    $('orderLogoChangeText').hidden = !l;
    if (l) logoThumb.src = l.dataUrl;
  }
  logoFile.addEventListener('change', async () => {
    const file = logoFile.files[0];
    logoFile.value = '';
    if (!file) return;
    try { await setLogo(await readLogoFile(file), file.name); }
    catch (e) { showError(ui().err.logo); }
  });
  logoRemove.addEventListener('click', () => clearLogo());
  document.addEventListener('logo:change', showLogo);

  function setMockup(m) {
    if (mockup && mockup.url) URL.revokeObjectURL(mockup.url);
    mockup = m;
    mockBox.hidden = !m;
    if (m) {
      mockBox.querySelector('img').src = m.url;
      mockBox.querySelector('.mock-label').textContent = m.label;
    }
  }
  $('orderMockupRemove').addEventListener('click', () => setMockup(null));

  // from the studio: product, method, color and the mockup picture
  document.addEventListener('order:prefill', (e) => {
    const d = e.detail || {};
    resetDone();
    if (d.pid && byId(d.pid)) { f.product.value = d.pid; fillDependents(); }
    if (d.tech) f.method.value = d.tech;
    if (d.color) f.color.value = d.color;
    if (d.blob) setMockup({ blob: d.blob, url: URL.createObjectURL(d.blob), label: d.label || '' });
    updateEstimate();
    document.getElementById('order').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => f.qty.focus({ preventScroll: true }), 500);
  });

  /* ---------------- validation ---------------- */
  const phoneOk = (v) => /^[0-9+ ()-]{8,20}$/.test(v) && v.replace(/\D/g, '').length >= 8;
  function check() {
    const errs = [];
    const mark = (el, msg) => {
      const field = el.closest('.field');
      field.classList.toggle('bad', !!msg);
      field.querySelector('.err').textContent = msg || '';
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) errs.push(el);
    };
    const E = ui().err;
    mark(f.other, !byId(f.product.value) && f.other.value.trim().length < 2 ? E.other : '');
    mark(f.qty, !(Number(f.qty.value) >= 1) ? E.qty : '');
    mark(f.name, f.name.value.trim().length < 2 ? E.name : '');
    mark(f.phone, !phoneOk(f.phone.value.trim()) ? E.phone : '');
    return errs;
  }

  function showError(msg) {
    errBox.hidden = !msg;
    errBox.querySelector('.msg').textContent = msg || '';
  }

  /* ---------------- sending ---------------- */
  function summary() {
    const def = byId(f.product.value);
    const product = def ? def[L()] : f.other.value.trim();
    const parts = [TECHS[f.method.value] ? TECHS[f.method.value][L()] : ui().unsure];
    if (def && def.colors.length && f.color.value !== 'other') parts.push(nameOf(f.color.value));
    return { def, product, detail: parts.join('، ') };
  }

  function waText(code, link) {
    const w = ui().wa, s = summary();
    const lines = [w.hi];
    if (code) lines.push(`${w.order}: ${code}`);
    lines.push(`${w.product}: ${s.product} (${s.detail})`, `${w.qty}: ${f.qty.value}`);
    if (f.deadline.value) lines.push(`${w.deadline}: ${new Intl.DateTimeFormat(L() === 'en' ? 'en-GB' : 'ar-EG', { dateStyle: 'long' }).format(new Date(f.deadline.value))}`);
    lines.push(`${w.name}: ${f.name.value.trim()}`);
    if (f.company.value.trim()) lines.push(`${w.company}: ${f.company.value.trim()}`);
    if (f.city.value.trim()) lines.push(`${w.city}: ${f.city.value.trim()}`);
    if (!f.sizes.closest('.check').hidden && f.sizes.checked) lines.push(w.sizes);
    if (f.notes.value.trim()) lines.push(`${w.notes}: ${f.notes.value.trim()}`);
    if (link) lines.push(`${w.track}: ${link}`);
    else if (getLogo()) lines.push(w.logo);
    return lines.join('\n');
  }
  const waUrl = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

  function remember(code, token) {
    try {
      const list = JSON.parse(localStorage.getItem('emese-orders') || '[]').filter(o => o.token !== token);
      list.unshift({ code, token, at: Date.now() });
      localStorage.setItem('emese-orders', JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* storage blocked */ }
  }

  function mockupFile() {
    if (!mockup) return null;
    const ext = mockup.blob.type === 'image/webp' ? 'webp' : mockup.blob.type === 'image/png' ? 'png' : 'jpg';
    return { blob: mockup.blob, ext };
  }

  async function send() {
    const s = summary();
    const folder = crypto.randomUUID();
    let logo_path = null, mockup_path = null;
    const lb = await logoBlob();
    if (lb) { logo_path = `orders/${folder}/logo.png`; await upload(logo_path, lb); }
    const mf = mockupFile();
    if (mf) { mockup_path = `orders/${folder}/mockup.${mf.ext}`; await upload(mockup_path, mf.blob); }
    const e = estimate(f.product.value, f.method.value, f.qty.value);
    const item = {
      product: s.def ? s.def.id : 'other', product_name: s.product,
      method: f.method.value, method_name: TECHS[f.method.value] ? TECHS[f.method.value][L()] : ui().unsure,
      color: s.def && s.def.colors.length ? f.color.value : null,
      color_name: s.def && s.def.colors.length && f.color.value !== 'other' ? nameOf(f.color.value) : null,
      qty: Math.floor(Number(f.qty.value)),
      collect_sizes: !f.sizes.closest('.check').hidden && f.sizes.checked
    };
    return rpc('create_order', { payload: {
      customer_name: f.name.value.trim(), phone: f.phone.value.trim(), company: f.company.value.trim(),
      email: f.email.value.trim(), city: f.city.value.trim(), items: [item], deadline: f.deadline.value || null,
      notes: f.notes.value.trim(), lang: L(), logo_path, mockup_path, estimate: e
    } });
  }

  function showDone(code, token) {
    const link = token ? `${SITE_BASE}track.html?o=${token}` : '';
    form.hidden = true;
    done.hidden = false;
    done.querySelector('.done-code').textContent = code || '';
    done.querySelector('.done-code').hidden = !code;
    done.querySelector('.done-text').textContent = code ? ui().doneSaved(code) : ui().doneWa;
    const trackA = $('orderTrack'), copyB = $('orderCopy'), waA = $('orderWa');
    trackA.hidden = copyB.hidden = !link;
    trackA.href = link || '#';
    copyB.dataset.link = link;
    waA.href = waUrl(waText(code, link));
    done.focus();
  }
  function resetDone() {
    form.hidden = false;
    done.hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const errs = check();
    if (errs.length) { errs[0].focus(); return; }
    if (!ready) {
      window.open(waUrl(waText()), '_blank', 'noopener');
      showDone(null, null);
      return;
    }
    submit.disabled = true;
    submit.querySelector('span').textContent = ui().sending;
    try {
      const r = await send();
      remember(r.code, r.token);
      showDone(r.code, r.token);
      form.reset();
      setMockup(null);
      fillDependents();
    } catch (err) {
      const E = ui().err;
      showError(E[err.code] || (err.code === 'phone_invalid' ? E.phone : err.code === 'name_invalid' ? E.name : E.generic));
      errBox.querySelector('a').href = waUrl(waText());
    } finally {
      submit.disabled = false;
      setLabel();
    }
  });

  $('orderCopy').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.link); } catch (err) { return; }
    const t = b.querySelector('span');
    const old = t.textContent;
    t.textContent = ui().copied;
    setTimeout(() => { t.textContent = old; }, 1600);
  });
  $('orderAnother').addEventListener('click', () => { resetDone(); f.product.focus(); });

  f.product.addEventListener('change', fillDependents);
  [f.method, f.qty].forEach(el => el.addEventListener('input', updateEstimate));
  function setLabel() { submit.querySelector('span').textContent = ready ? ui().send : ui().sendWa; }
  document.addEventListener('langchange', () => { fillProducts(); fillDependents(); setLabel(); });
  setLabel();
  fillProducts();
  fillDependents();
  showLogo();
}
