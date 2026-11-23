# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Companies and offices** in Egypt ordering staff uniforms (polos, shirts, T-shirts, hoodies), corporate gifts and branded stationery for their team and clients. Usually an office manager, HR or marketing person comparing suppliers on a phone, then sending a request.
- **Restaurants and cafes** ordering chef uniforms, chef hats, aprons, caps, mugs and coasters.
- **Brands and events** ordering clothing labels, hang tags, zipper pulls, lanyards, feather flags, totes and giveaways.

The job: get branded supplies made, see what they will look like with their own logo, and get a price, without chasing several suppliers.

## Product Purpose
EMESE (emese-eg.com) makes custom supplies with the customer's logo: apparel and workwear, headwear, office goods, corporate gifts, and clothing accessories. The site shows the range, lets visitors try their own logo on the products (studio), and collects quote requests that go to WhatsApp. Success: a visitor sends a quote request or a WhatsApp message.

## Positioning
- **Everything in one place:** clothing, workwear, office goods, gifts and accessories from one supplier, in one order.
- **All techniques in-house:** embroidery, DTF, screen print, UV, sublimation, laser engraving, hot foil, weaving and sewing.
- **See it before you pay:** try your logo on the products online; a design is sent for approval before production.
- **Small runs welcome:** from a single piece to a whole company's uniforms.

## Operating Context
Visitors arrive from Instagram, Facebook, LinkedIn and WhatsApp, mostly on phones. The order flow: request (form or WhatsApp) → price and design for approval → approval → production → delivery. Optional tools: order tracking, size-list links for employees, a staff dashboard (these need the Supabase backend, not yet connected).

## Capabilities and Constraints
- Static site (HTML, CSS, JS modules) on GitHub Pages, custom domain emese-eg.com. No build step.
- Arabic (Egyptian, right to left) by default, English toggle; light theme by default, dark theme available.
- Studio: WebGL mockups; 3D clothing models (T-shirt, long-sleeve polo, hoodie, cap, apron) and photo mockups for the rest; the visitor's logo stays on their device.
- Quote form sends to WhatsApp +20 128 050 9299 until the Supabase backend is connected.
- Socials: Instagram @emese.eg, Facebook page id 61595520390777.
- Never use an em dash anywhere on the site.

## Brand Commitments
- Name **EMESE**, wordmark in DM Serif Display with a magenta dot ("EMESE."). This stays the logo (a striped "EMESE custom supplies" logo seen in some photos is not the brand logo).
- Process colours cyan #00a3e0, magenta #e6007e, yellow #ffe500 are part of the identity (print-shop CMY).
- Voice: Egyptian Arabic, plain and warm; headline line "إنت تتخيّل، وإحنا ننفّذ".

## Evidence on Hand
- Product photos (ChatGPT-made, 25 products, each a "logo" display version and a blank studio version): `assets/products/` (source: Google Drive folder from the owner). Most display versions show a placeholder "YOUR LOGO" mark on purpose (it signals the customer's logo goes there); seven show the EMESE striped logo.
- No real customer photos, client names, reviews, prices, delivery times, minimum quantities, years in business or address yet. Do not invent any of these.

## Product Principles
1. Show the product with a logo on it on every screen; the range is the argument.
2. Every path ends at a quote request or WhatsApp in one tap.
3. Arabic first, phone first.
4. Claim only what is true; let the studio and the photos do the persuading.
