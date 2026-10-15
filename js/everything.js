/* EMESE: the full range, filterable by what each item is made with. */
import { lang } from './i18n.js';

export const CAPS = {
  laser:   ['ليزر', 'Laser'],
  dtf:     ['DTF', 'DTF'],
  uv:      ['UV', 'UV'],
  uvdtf:   ['UV DTF', 'UV DTF'],
  sub:     ['سبلميشن', 'Sublimation'],
  screen:  ['سلك سكرين', 'Silk screen'],
  stitch:  ['تطريز', 'Embroidery'],
  sewing:  ['تصنيع ملابس', 'Garment making'],
  weaving: ['نسيج', 'Weaving'],
  zippers: ['سوست', 'Zippers']
};

// [arabic, english, capabilities, studio mockup id]
export const GROUPS = [
  { ar: 'ملابس وتصنيع', en: 'Apparel & garment making', items: [
    ['تيشيرتات بيسك', 'Basic T-shirts', 'dtf screen stitch sub sewing', 'tee'],
    ['بولو نص كم', 'Short-sleeve polos', 'stitch dtf screen sewing', 'polo'],
    ['بولو كم طويل', 'Long-sleeve polos', 'stitch dtf screen sewing', 'polo_ls'],
    ['هوديز', 'Hoodies', 'dtf stitch screen sewing', 'hoodie'],
    ['هوديز بسوستة', 'Zip hoodies', 'dtf stitch sewing zippers'],
    ['سويت شيرت', 'Sweatshirts', 'dtf stitch screen sewing'],
    ['جواكت وبومبر', 'Jackets & bombers', 'stitch dtf sewing zippers'],
    ['قمصان رسمية', 'Dress shirts', 'stitch sewing'],
    ['يونيفورم شركات', 'Corporate uniforms', 'stitch dtf sewing'],
    ['يونيفورم مدارس', 'School uniforms', 'stitch screen sewing'],
    ['يونيفورم طبي (سكراب)', 'Medical scrubs', 'stitch sewing'],
    ['أوفرولات وبدل شغل', 'Work overalls', 'screen stitch sewing zippers'],
    ['مرايل مطابخ وكافيهات', 'Aprons', 'dtf stitch screen sewing', 'apron'],
    ['بدل شيفات', 'Chef jackets', 'stitch sewing'],
    ['تريننجات وملابس رياضة', 'Tracksuits & sportswear', 'sub dtf sewing zippers'],
    ['فانلات فرق رياضية', 'Team jerseys', 'sub dtf sewing'],
    ['صديري أمن عاكس', 'Hi-vis vests', 'screen dtf sewing'],
    ['بيجامات وملابس بيت', 'Loungewear', 'sub screen sewing']
  ]},
  { ar: 'كابات وشنط', en: 'Headwear & bags', items: [
    ['كابات', 'Caps', 'stitch dtf sewing', 'cap'],
    ['بوكيت هات', 'Bucket hats', 'stitch dtf sewing'],
    ['طواقي شتوي', 'Beanies', 'stitch weaving'],
    ['باندانا', 'Bandanas', 'sub screen'],
    ['شنط قماش', 'Tote bags', 'screen dtf stitch sewing', 'tote'],
    ['شنط ظهر', 'Backpacks', 'stitch dtf uvdtf sewing zippers'],
    ['شنط لاب توب', 'Laptop sleeves', 'stitch dtf sewing zippers'],
    ['شنط رياضة', 'Gym bags', 'stitch dtf sewing zippers'],
    ['شنط برباط', 'Drawstring bags', 'screen sub sewing'],
    ['محافظ وجرابات جلد', 'Leather wallets & cases', 'laser uv']
  ]},
  { ar: 'إكسسوارات الملابس', en: 'Garment accessories', items: [
    ['تيكت منسوج', 'Woven labels', 'weaving', 'label'],
    ['تيكت ساتان مطبوع', 'Printed satin labels', 'screen'],
    ['تيكت عناية وغسيل', 'Care labels', 'screen'],
    ['هانج تاج كرتون', 'Hang tags', 'uv laser', 'hangtag'],
    ['باتش تطريز', 'Embroidered patches', 'stitch'],
    ['باتش جلد', 'Leather patches', 'laser uv', 'patch'],
    ['باتش منسوج', 'Woven patches', 'weaving'],
    ['زراير بلوجو', 'Logo buttons', 'laser uv'],
    ['كبسونات ومسامير جينز', 'Snaps & jeans rivets', 'laser'],
    ['شدّاد سوستة بلوجو', 'Logo zipper pulls', 'laser uv zippers', 'zipper'],
    ['أستك وشرايط بلوجو', 'Logo elastic & tapes', 'weaving screen'],
    ['حبال هودي', 'Hoodie drawcords', 'weaving'],
    ['لانيارد ومعلّقات', 'Lanyards', 'sub screen weaving']
  ]},
  { ar: 'سوست', en: 'Zippers', items: [
    ['سوست نايلون', 'Nylon coil zippers', 'zippers'],
    ['سوست معدن', 'Metal zippers', 'zippers'],
    ['سوست بلاستيك', 'Moulded plastic zippers', 'zippers'],
    ['سوست ضد المية', 'Water-repellent zippers', 'zippers'],
    ['سوست بالمقاس واللون اللي تطلبه', 'Zippers cut and coloured to order', 'zippers'],
    ['شدّادات سوست مخصّصة', 'Custom zipper pullers', 'zippers laser uv', 'zipper']
  ]},
  { ar: 'نسيج وأقمشة', en: 'Textiles & fabrics', items: [
    ['نسيج أقمشة حسب الطلب', 'Custom woven fabrics', 'weaving'],
    ['أقمشة يونيفورم', 'Uniform fabrics', 'weaving sewing'],
    ['طباعة أقمشة بالمتر', 'Fabric printing by the metre', 'sub screen'],
    ['شرايط منسوجة بلوجو', 'Logo woven tapes', 'weaving'],
    ['فوط ومناشف بلوجو', 'Logo towels', 'stitch weaving'],
    ['مفارش وأغطية', 'Table linen & covers', 'sub stitch sewing']
  ]},
  { ar: 'مكتب وأدوات', en: 'Office & stationery', items: [
    ['كشاكيل ونوت بوك', 'Notebooks', 'laser uv', 'notebook'],
    ['أجندات جلد', 'Leather planners', 'laser uv'],
    ['أقلام معدن', 'Metal pens', 'laser uv', 'pen'],
    ['أقلام بلاستيك', 'Plastic pens', 'uv'],
    ['كروت بيزنس', 'Business cards', 'uv', 'cards'],
    ['كروت معدن وخشب', 'Metal & wood cards', 'laser uv'],
    ['ماوس باد', 'Mouse pads', 'sub uv', 'mousepad'],
    ['ستيكرات وليبلز', 'Stickers & labels', 'uvdtf uv'],
    ['فلاشات USB', 'USB drives', 'laser uv'],
    ['حوامل موبايل وأقلام', 'Phone & pen holders', 'laser uv'],
    ['باور بانك', 'Power banks', 'laser uv'],
    ['فولدرات وظروف', 'Folders & envelopes', 'uv']
  ]},
  { ar: 'هدايا وجيف أواي', en: 'Gifts & giveaways', items: [
    ['مجات', 'Mugs', 'sub uvdtf uv', 'mug'],
    ['زمزميات ستانلس', 'Stainless bottles', 'laser uv uvdtf', 'tumbler'],
    ['كوبايات حرارية', 'Travel mugs', 'laser uvdtf'],
    ['ميداليات خشب', 'Wood keychains', 'laser uv', 'keychain'],
    ['ميداليات معدن وجلد', 'Metal & leather keychains', 'laser'],
    ['دروع وتكريمات', 'Awards & plaques', 'laser uv'],
    ['كوسترز', 'Coasters', 'laser uv sub'],
    ['بوكسات هدايا', 'Gift boxes', 'laser uv'],
    ['ساعات حائط', 'Wall clocks', 'uv sub'],
    ['ماجنت', 'Fridge magnets', 'uv sub'],
    ['بازل مطبوع', 'Printed puzzles', 'sub'],
    ['جرابات موبايل', 'Phone cases', 'uv uvdtf']
  ]},
  { ar: 'أعلام ولافتات', en: 'Flags & signs', items: [
    ['أعلام مكتب', 'Desk flags', 'sub dtf', 'flag'],
    ['أعلام سارية', 'Pole flags', 'sub screen sewing'],
    ['رايات معارض', 'Event banners', 'sub sewing'],
    ['لافتات أكريليك وخشب', 'Acrylic & wood signs', 'laser uv'],
    ['ستاندات أكريليك', 'Acrylic stands', 'laser uv']
  ]}
];

const STR = {
  ar: { all: 'الكل', try: 'جرّبه', count: (n) => `${n} منتج` },
  en: { all: 'All', try: 'Try it', count: (n) => `${n} items` }
};

export function initEverything({ onTry } = {}) {
  const root = document.getElementById('everything');
  if (!root) return;
  const filters = root.querySelector('.ev-filters');
  const list = root.querySelector('.ev-groups');
  const countEl = root.querySelector('.ev-count');
  let active = 'all';

  const L = () => (lang() === 'en' ? 1 : 0);

  function render() {
    const l = L();
    const s = STR[l ? 'en' : 'ar'];
    const counts = {};
    let total = 0;
    GROUPS.forEach(g => g.items.forEach(it => {
      total++;
      it[2].split(' ').forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    }));
    filters.innerHTML = [['all', s.all, total], ...Object.keys(CAPS).map(k => [k, CAPS[k][l], counts[k] || 0])]
      .map(([k, label, n]) => `<button type="button" class="ev-chip" data-cap="${k}" aria-pressed="${k === active}">${label}<small>${n}</small></button>`)
      .join('');

    let shown = 0;
    list.innerHTML = GROUPS.map(g => {
      const items = g.items.filter(it => active === 'all' || it[2].split(' ').includes(active));
      if (!items.length) return '';
      shown += items.length;
      return `<div class="ev-group">
        <h3>${l ? g.en : g.ar}<span>${items.length}</span></h3>
        <ul>${items.map(it => `<li>
          <span class="ev-name">${it[l]}</span>
          <span class="ev-tags">${it[2].split(' ').map(c => `<i class="${c === active ? 'on' : ''}">${CAPS[c][l]}</i>`).join('')}</span>
          ${it[3] ? `<button type="button" class="ev-try" data-mock="${it[3]}">${s.try} <span class="arr" aria-hidden="true"></span></button>` : ''}
        </li>`).join('')}</ul>
      </div>`;
    }).join('');
    countEl.textContent = s.count(shown);
  }

  filters.addEventListener('click', (e) => {
    const b = e.target.closest('.ev-chip');
    if (!b) return;
    active = b.dataset.cap;
    render();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.ev-try');
    if (b && onTry) onTry(b.dataset.mock);
  });
  document.addEventListener('langchange', render);
  render();
}
