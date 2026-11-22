/* EMESE: site settings. The order system turns on as soon as the two Supabase values are filled in
 * (Supabase dashboard: Project settings, API). The anon key is meant to be public: the database only
 * lets visitors do what supabase/migrations allows. */
export const SUPABASE_URL = '';          // e.g. 'https://abcdefgh.supabase.co'
export const SUPABASE_ANON_KEY = '';     // the project's "anon public" key

// WhatsApp number for orders, international format without "+" (20 = Egypt).
export const WHATSAPP_NUMBER = '201280509299';

// Social accounts (footer, the floating WhatsApp button and search engines read these).
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61595520390777';
export const INSTAGRAM_URL = 'https://www.instagram.com/emese.eg/';

// Base address of the site, for the links we send to customers (tracking, size lists).
export const SITE_BASE = new URL('./', document.baseURI).href;
