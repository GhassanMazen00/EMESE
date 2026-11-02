/* EMESE: a small client for Supabase's REST, auth and storage endpoints (no library needed). */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const ready = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const BUCKET = 'uploads';

export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function req(path, { method = 'GET', body, token, headers = {}, raw = false } = {}) {
  if (!ready) throw new ApiError('not_configured', 0);
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`, ...headers };
  if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, { method, headers: h, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiError('network', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    // database functions raise short codes (phone_invalid, too_many_requests...)
    const msg = (data && (data.message || data.error_description || data.msg || data.error)) || `http_${res.status}`;
    throw new ApiError(String(msg).split('\n')[0], res.status);
  }
  return data;
}

/* ---- public functions (visitors) ---- */
export const rpc = (fn, args = {}, token) => req(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, token });

export const publicUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}` : '');

export function upload(path, blob, token) {
  return req(`/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', body: blob, raw: true, token,
    headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': '31536000' }
  });
}

/* ---- tables (staff, with their session token) ---- */
export const select = (table, query, token) => req(`/rest/v1/${table}?${query}`, { token });
export const insert = (table, row, token) =>
  req(`/rest/v1/${table}`, { method: 'POST', body: row, token, headers: { Prefer: 'return=representation' } }).then(r => r && r[0]);
export const update = (table, query, patch, token) =>
  req(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: patch, token, headers: { Prefer: 'return=representation' } }).then(r => r && r[0]);
export const remove = (table, query, token) => req(`/rest/v1/${table}?${query}`, { method: 'DELETE', token });

/* ---- staff sign-in, kept on this device ---- */
const KEY = 'emese-staff-session';
let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }

function keep(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token,
                  expires_at: Date.now() + (s.expires_in || 3600) * 1000, email: s.user && s.user.email } : null;
  try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  return session;
}

export async function signIn(email, password) {
  return keep(await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
}

export async function signOut() {
  const t = session && session.access_token;
  keep(null);
  if (t) { try { await req('/auth/v1/logout', { method: 'POST', token: t }); } catch (e) { /* already signed out */ } }
}

/* A valid access token, refreshed when it is about to expire; null when signed out. */
export async function staffToken() {
  if (!session) return null;
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  try {
    return keep(await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }))
      .access_token;
  } catch (e) {
    keep(null);
    return null;
  }
}

export const staffEmail = () => session && session.email;
