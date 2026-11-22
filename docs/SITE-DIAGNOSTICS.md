# emese-eg.com: what the site is missing

Checked on 22 November 2026, on the code in this repository, at desktop (1440 px) and phone (390 px) size.
The live address could not be opened from the checking machine, so the live copy itself is item 1.

## What already works

| Check | Result |
|---|---|
| Speed | homepage loads in about 1 second, about 750 KB in total (good) |
| Errors | no broken links, no missing files, no script errors |
| Phones | nothing runs off the screen from 320 px wide; phone menu works |
| Accessibility basics | every image has a description, every form field has a label, one main title |
| Languages and themes | Arabic and English, light and dark, all pages |
| Ordering | the order form sends the full order to WhatsApp **0128 050 9299** |
| Contact | floating WhatsApp button, footer phone, Instagram and Facebook links |
| Sharing | link preview image and text for WhatsApp, Facebook and LinkedIn |
| Search engines | page description, company details with the social accounts, robots.txt, sitemap.xml |
| Install | the site can be installed on a phone as an app, and works offline |

---

## Must fix (it costs you orders or trust)

1. **Make sure emese-eg.com shows the latest version.** Everything is on the branch
   `claude/eloquent-wright-pjugod`. In GitHub: the repository, then **Settings**, then **Pages**: the
   source must be that branch (or merge it into `main` and use `main`). Then open emese-eg.com on your
   phone and check you see the photo grid and the green WhatsApp button.
2. **Product photos.** Being redone with AI (list in `AI-PHOTO-LIST.md`).
3. **The order database is not switched on.** Right now an order only becomes a WhatsApp message. These
   features are built but stay off until it is connected:
   - customers tracking their order with a link (`track.html`)
   - sending a design for approval and the customer approving it online
   - the team dashboard (`admin.html`) with every order and its status
   - the size-list link employees fill in (`sizes.html`)

   **Fix:** create a free Supabase project (supabase.com), and either give me access or send me its two
   values (Project URL and anon public key, under Project settings, API). I connect it in about 15 minutes.
4. **Who is EMESE?** There is nothing about the company itself: where you are (city or area), how long
   you have worked, who you work with. Customers ordering 100 uniforms want to know a real business is
   behind the site. **Send me:** your city or area, the year you started, and anything true about your
   experience. I will add a short "about us" section.
5. **Real work.** There are no photos of orders you actually delivered. Even 4 to 6 phone photos of real
   finished pieces (with the customer's permission, or with your own logo) do more than any mockup. **Send
   them** and I will add a "our work" section.

## Should add (it answers questions before customers ask)

6. **FAQ section.** The questions every customer asks on WhatsApp: minimum quantity, how long it takes,
   how to pay (cash, transfer, InstaPay, deposit?), delivery areas and cost, what file to send for the
   logo, can I get a sample. **Send me your answers** and I will write them up.
7. **Prices.** The order form can show an instant price range while the customer fills it in, but every
   price is empty (`js/pricing.js`). Send me a price per product and per method (even rough), and it
   switches on. Optional.
8. **Business hours and email.** Neither is on the site. A business email such as `info@emese-eg.com`
   looks more serious than Gmail (Zoho Mail has a free plan for your own domain).
9. **Privacy and terms page.** The form collects names, phone numbers and logos. A short page saying what
   you keep and why, plus your terms (deposit, changes after approval, delivery), builds trust and
   protects you. I can write a first draft for you to check.
10. **Google.** Create a free **Google Business Profile** (shows EMESE on Google Maps and in searches like
    "تطريز يونيفورم"), and add the site to **Google Search Console** with the sitemap
    (`https://emese-eg.com/sitemap.xml`) so Google finds it faster.
11. **Visitor numbers.** Nothing counts visits or WhatsApp clicks, so you cannot tell which posts bring
    customers. Free options: Google Analytics, or the Meta Pixel (needed later for Facebook and Instagram
    ads). Tell me which and I add it.
12. **"Page not found" page.** A wrong link shows GitHub's grey error page. A branded one with a WhatsApp
    button keeps the visitor.

## Nice to have

13. **LinkedIn link** in the footer, once the page exists (send me the link).
14. **The hat collection.** The site says you have a big collection, but shows one baseball cap. Photos of
    a snapback, trucker, bucket hat, beanie and visor would prove it (they are in the AI photo list).
15. **The full product list** (99 items under "the list goes on") has no pictures; fine for now.
16. **English for Google.** English is a button on the same page, so Google only sees the Arabic. A
    separate English address (`emese-eg.com/en/`) would bring English searches. Only worth it if you sell
    to non-Arabic speakers.
17. **Fonts are the heaviest part of the page** (about 270 KB of the 750 KB). Trimming them would make the
    first visit faster on slow phones.
18. **Customer reviews.** None on the site. Once real customers are happy, ask for a short quote and
    permission to use their name or company; never invent them.

## What I need from you (short list)

- [ ] GitHub Pages check (item 1), or tell me what you see on emese-eg.com
- [ ] AI product photos (`AI-PHOTO-LIST.md`)
- [ ] Supabase project values or access (item 3)
- [ ] City or area, year started, about-us facts (item 4)
- [ ] 4 to 6 photos of real delivered work (item 5)
- [ ] FAQ answers: minimum, lead time, payment, delivery, sample (item 6)
- [ ] Business hours and an email (item 8)
- [ ] Analytics: Google Analytics or Meta Pixel? (item 11)
- [ ] LinkedIn page link, when ready (item 13)
