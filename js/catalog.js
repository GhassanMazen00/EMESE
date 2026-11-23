/* EMESE: products shown in the studio and hero, with what each can be made with. */

export const TECHS = {
  dtf:     { mode: 'print', ar: 'DTF', en: 'DTF',
             noteAr: 'بنطبع على فيلم ونكبسه بالحرارة. ألوان كاملة على أي لون قماش، وبيستحمل الغسيل.',
             noteEn: 'Printed on film and heat pressed. Full color on any fabric color, and it survives the wash.' },
  screen:  { mode: 'print', ar: 'سلك سكرين', en: 'Screen print',
             noteAr: 'أحسن حاجة للكميات الكبيرة: حبر تقيل وألوان ثابتة بسعر أوفر.',
             noteEn: 'Best for large runs: thick ink and solid colors at a lower unit price.' },
  digital: { mode: 'print', ar: 'ديجيتال', en: 'Digital',
             noteAr: 'طباعة ديجيتال على الورق بألوان دقيقة، مناسبة لأي كمية.',
             noteEn: 'Digital print on paper with accurate color, for any quantity.' },
  sub:     { mode: 'dye', ar: 'سبلميشن', en: 'Sublimation',
             noteAr: 'الحبر بيدخل جوّه الخامة نفسها فمش هتحسّ بيه. أحلى على الألوان الفاتحة.',
             noteEn: "The ink goes into the material itself, so you can't feel it. Best on light colors." },
  uv:      { mode: 'uv', gloss: 0.12, ar: 'UV', en: 'UV',
             noteAr: 'طباعة مباشرة على المنتج والحبر بيتجفف بالأشعة في ساعتها. ألوان قوية بلمسة بارزة.',
             noteEn: 'Printed straight onto the product and cured instantly with UV light. Strong color with a slight raise.' },
  uvdtf:   { mode: 'uv', gloss: 0.5, ar: 'UV DTF', en: 'UV DTF',
             noteAr: 'ستيكر كريستال من غير خلفية، بلمعة وبروز. بيتلزق على أي سطح ناشف.',
             noteEn: 'A backgroundless crystal sticker with gloss and relief. Bonds to any hard surface.' },
  stitch:  { mode: 'stitch', ar: 'تطريز', en: 'Embroidery',
             noteAr: 'اللوجو بيتخيّط بالخيط غرزة غرزة. ملمس بارز وشكل رسمي، ومكانه الطبيعي على الصدر.',
             noteEn: 'Your logo stitched in thread. Raised, formal and at home on the chest.' },
  laser:   { mode: 'laser', ar: 'ليزر', en: 'Laser',
             noteAr: 'الليزر بيحفر جوّه الخامة نفسها، فمالوش لون حبر ومستحيل يتمسح.',
             noteEn: 'The laser engraves into the material itself. No ink, and it never wears off.' },
  woven:   { mode: 'stitch', pitch: 0.00032, relief: 0.12, ar: 'نسيج', en: 'Woven',
             noteAr: 'اللوجو بيتنسج بالخيط جوّه التيكت نفسه، بتفاصيل دقيقة وملمس ناعم.',
             noteEn: 'The logo is woven into the label itself in thread: fine detail, soft hand.' },
  foil:    { mode: 'foil', ar: 'فويل', en: 'Foil',
             noteAr: 'فويل دهبي أو فضي بالحرارة، بلمعة معدن وغاير خفيف في الورق أو الجلد.',
             noteEn: 'Hot-stamped gold or silver foil, with a metallic shine and a slight deboss.' }
};

export const COLOR_NAMES = {
  '#f2f1ee': ['أبيض', 'White'], '#262626': ['أسود', 'Black'], '#1f2b4a': ['كحلي', 'Navy'], '#a8171f': ['أحمر', 'Red'],
  '#8b8d8f': ['رمادي', 'Heather grey'], '#4b5a3a': ['زيتي', 'Olive'], '#d9c7a5': ['بيج', 'Sand'], '#9cc3e0': ['لبني', 'Sky blue'],
  '#e8dcc4': ['قماش طبيعي', 'Natural'], '#f4f3ef': ['أبيض', 'White'], '#2f6b4f': ['أخضر', 'Green'], '#8fa58a': ['مِنت', 'Sage'],
  '#e9e1d1': ['كريمي', 'Cream'], '#6b3f26': ['بني جلد', 'Tan leather'], '#6d1a24': ['نبيتي', 'Burgundy'], '#1d5fa8': ['أزرق', 'Blue'],
  '#161616': ['أسود', 'Black'], '#c7a97f': ['كرافت', 'Kraft'], '#efe7d6': ['عاجي', 'Ivory'],
  '#141414': ['أسود', 'Black'], '#f6f4ef': ['أبيض', 'White'], '#d4af37': ['دهبي', 'Gold'], '#ec008c': ['فوشيا', 'Magenta'],
  '#00aeef': ['سماوي', 'Cyan'], '#ffe500': ['أصفر', 'Yellow'], '#c8ccd2': ['فضي', 'Silver'], '#c58b74': ['روز جولد', 'Rose gold'],
  '#b07a4b': ['جملي', 'Tan']
};

export const INKS = ['#141414', '#f6f4ef', '#d4af37', '#a8171f', '#1f2b4a', '#ec008c', '#00aeef', '#ffe500'];
export const FOILS = ['#d4af37', '#c8ccd2', '#c58b74'];

const APPAREL = ['#f2f1ee', '#262626', '#1f2b4a', '#a8171f', '#8b8d8f', '#4b5a3a', '#d9c7a5', '#9cc3e0'];

export const PRODUCTS = [
  // apparel and workwear
  { id: 'polo', cat: 'apparel', ar: 'بولو نص كم', en: 'Polo, short sleeve', widthM: 0.56, contact: 'uniform',
    techs: ['stitch', 'dtf', 'screen', 'sub'], colors: APPAREL },
  { id: 'polo_ls', cat: 'apparel', ar: 'بولو كم طويل', en: 'Polo, long sleeve', widthM: 0.56, contact: 'uniform',
    techs: ['stitch', 'dtf', 'screen', 'sub'], colors: APPAREL },
  { id: 'shirt', cat: 'apparel', ar: 'قميص', en: 'Button-up shirt', widthM: 0.45, contact: 'uniform', dark: true,
    techs: ['stitch', 'dtf'], colors: [] },
  { id: 'tee', cat: 'apparel', ar: 'تيشيرت', en: 'T-shirt', widthM: 0.56, contact: 'uniform',
    techs: ['dtf', 'screen', 'stitch', 'sub'], colors: APPAREL },
  { id: 'hoodie', cat: 'apparel', ar: 'هودي', en: 'Hoodie', widthM: 0.58, contact: 'uniform',
    techs: ['dtf', 'stitch', 'screen'], colors: ['#f2f1ee', '#262626', '#1f2b4a', '#8b8d8f', '#4b5a3a', '#6d1a24', '#d9c7a5'] },
  { id: 'chef', cat: 'apparel', ar: 'جاكيت شيف', en: 'Chef jacket', widthM: 0.14, contact: 'uniform',
    techs: ['stitch', 'dtf'], colors: [] },
  { id: 'chefhat', cat: 'apparel', ar: 'طاقية شيف', en: "Chef's hat", widthM: 0.3, contact: 'caps',
    techs: ['stitch', 'dtf'], colors: [] },
  { id: 'apron', cat: 'apparel', ar: 'مريلة', en: 'Apron', widthM: 0.66, contact: 'uniform',
    techs: ['dtf', 'stitch', 'screen'], colors: ['#262626', '#f2f1ee', '#1f2b4a', '#6b3f26', '#4b5a3a', '#a8171f'] },
  { id: 'cap', cat: 'apparel', ar: 'كاب بيسبول', en: 'Baseball cap', widthM: 0.135, contact: 'caps',
    techs: ['stitch', 'dtf'], colors: ['#f2f1ee', '#262626', '#1f2b4a', '#a8171f', '#4b5a3a', '#d9c7a5', '#9cc3e0'] },
  { id: 'vest', cat: 'apparel', ar: 'صديري عاكس', en: 'Hi-vis vest', widthM: 0.15, contact: 'uniform',
    techs: ['screen', 'dtf'], colors: [] },
  { id: 'helmet', cat: 'apparel', ar: 'خوذة أمان', en: 'Safety helmet', widthM: 0.2, contact: 'gifts',
    techs: ['uvdtf', 'uv'], colors: [] },
  // garment accessories and events
  { id: 'label', cat: 'accessories', ar: 'تيكت منسوج', en: 'Woven label', widthM: 0.062, contact: 'labels', dark: true,
    techs: ['woven', 'screen'], colors: [] },
  { id: 'hangtag', cat: 'accessories', ar: 'هانج تاج', en: 'Hang tag', widthM: 0.05, contact: 'labels',
    techs: ['digital', 'foil', 'uv'], colors: [] },
  { id: 'zipper', cat: 'accessories', ar: 'شدّاد سوستة', en: 'Zipper puller', widthM: 0.014, contact: 'accessories', reveal: true, dark: true,
    techs: ['laser', 'uv'], colors: [] },
  { id: 'patch', cat: 'accessories', ar: 'باتش جلد', en: 'Leather patch', widthM: 0.061, contact: 'accessories',
    techs: ['laser', 'foil', 'uv'], colors: ['#b07a4b', '#6b3f26', '#262626', '#d9c7a5'] },
  { id: 'tote', cat: 'accessories', ar: 'شنطة قماش', en: 'Tote bag', widthM: 0.36, contact: 'totes',
    techs: ['dtf', 'screen', 'stitch'], colors: [] },
  { id: 'lanyard', cat: 'accessories', ar: 'لانيارد وكارنيه', en: 'Lanyard & badge', widthM: 0.055, contact: 'gifts',
    techs: ['digital', 'uv', 'sub'], colors: [] },
  { id: 'featherflag', cat: 'accessories', ar: 'علم ريشة', en: 'Feather flag', widthM: 0.6, contact: 'flags',
    techs: ['sub', 'dtf'], colors: [] },
  { id: 'keychain', cat: 'accessories', ar: 'ميدالية معدن', en: 'Metal keychain', widthM: 0.035, contact: 'gifts',
    techs: ['laser', 'uv'], colors: [] },
  // office and gifts
  { id: 'giftset', cat: 'office', ar: 'بوكس هدايا', en: 'Gift set', widthM: 0.13, contact: 'gifts', dark: true,
    techs: ['laser', 'foil', 'uv'], colors: [] },
  { id: 'notebook', cat: 'office', ar: 'كشكول', en: 'Notebook', widthM: 0.13, contact: 'notebooks', dark: true,
    techs: ['laser', 'foil', 'uv'], colors: [] },
  { id: 'pen', cat: 'office', ar: 'قلم', en: 'Pen', widthM: 0.06, contact: 'pens', reveal: true, dark: true,
    techs: ['laser', 'uv'], colors: [] },
  { id: 'cards', cat: 'office', ar: 'كروت', en: 'Business cards', widthM: 0.09, contact: 'cards', dark: true,
    techs: ['digital', 'uv', 'foil'], colors: [] },
  { id: 'mug', cat: 'office', ar: 'مج', en: 'Mug', widthM: 0.2, contact: 'mugs',
    techs: ['sub', 'uvdtf', 'uv'], colors: [] },
  { id: 'tumbler', cat: 'office', ar: 'زمزمية', en: 'Water bottle', widthM: 0.15, contact: 'mugs', reveal: true, dark: true,
    techs: ['laser', 'uv', 'uvdtf'], colors: [] },
  { id: 'coasters', cat: 'office', ar: 'كوسترز', en: 'Coasters', widthM: 0.1, contact: 'gifts',
    techs: ['uv', 'sub', 'laser'], colors: [] },
  { id: 'mousepad', cat: 'office', ar: 'ماوس باد', en: 'Mouse pad', widthM: 0.25, contact: 'gifts',
    techs: ['sub', 'uv'], colors: ['#f2f1ee', '#262626', '#1f2b4a', '#8b8d8f'] }
];

/* The homepage ranges: who each group is for, and its products (all have a photo pair in assets/products). */
export const RANGES = [
  { id: 'uniforms', ar: 'يونيفورم الشركات', en: 'Company uniforms',
    forAr: 'للشركات والمكاتب', forEn: 'For companies and offices',
    dAr: 'بولو وقمصان وتيشيرتات وهوديز باللوجو بتاعك، متطرّز أو مطبوع، لفريق كامل بكل المقاسات.',
    dEn: 'Polos, shirts, T-shirts and hoodies with your logo, embroidered or printed, for a whole team in every size.',
    items: ['polo', 'polo_ls', 'shirt', 'tee', 'hoodie'] },
  { id: 'kitchen', ar: 'مطاعم وكافيهات', en: 'Restaurants and cafes',
    forAr: 'للمطبخ والصالة', forEn: 'For the kitchen and the floor',
    dAr: 'جاكيت الشيف والطاقية والمريلة، والمج والكوسترز على الترابيزة. كله بنفس الهوية.',
    dEn: "The chef's jacket, hat and apron, and the mugs and coasters on the table. All in one identity.",
    items: ['chef', 'chefhat', 'apron', 'mug', 'coasters'] },
  { id: 'office', ar: 'مكاتب وهدايا شركات', en: 'Office and corporate gifts',
    forAr: 'للفريق والعملا', forEn: 'For your team and clients',
    dAr: 'بوكس هدايا كامل، أو قطعة واحدة محفورة: كشاكيل، أقلام، كروت، زمزميات وميداليات.',
    dEn: 'A full gift box or a single engraved piece: notebooks, pens, cards, bottles and keychains.',
    items: ['giftset', 'notebook', 'pen', 'cards', 'tumbler', 'keychain'] },
  { id: 'events', ar: 'براندات وفعاليات', en: 'Brands and events',
    forAr: 'للمعارض والإيفنتات', forEn: 'For shows and events',
    dAr: 'علم ريشة على الباب، لانيارد على كل رقبة، شنطة في كل إيد، وكاب للفريق.',
    dEn: 'A feather flag at the door, a lanyard on every neck, a tote in every hand and caps for the crew.',
    items: ['featherflag', 'lanyard', 'tote', 'cap'] },
  { id: 'safety', ar: 'شغل وأمان', en: 'Workwear and safety',
    forAr: 'للمواقع والمصانع', forEn: 'For sites and factories',
    dAr: 'صديري عاكس وخوذة عليهم اسم الشركة، عشان فريقك يبان من بعيد.',
    dEn: 'Hi-vis vests and helmets carrying your company name, so your crew stands out on site.',
    items: ['vest', 'helmet'] },
  { id: 'trims', ar: 'إكسسوارات البراند', en: 'Brand trims',
    forAr: 'لبراندات الهدوم', forEn: 'For clothing brands',
    dAr: 'التفاصيل اللي بتخلّي القطعة بتاعتك: تيكت منسوج، هانج تاج، وشدّاد سوستة باللوجو.',
    dEn: 'The details that make a garment yours: woven labels, hang tags and logo zipper pulls.',
    items: ['label', 'hangtag', 'zipper'] }
];

export const CATS = ['apparel', 'accessories', 'office'];

export const byId = (id) => PRODUCTS.find(p => p.id === id);

/* Relative luminance of an sRGB hex colour, 0..1. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
