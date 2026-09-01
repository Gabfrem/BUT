/* Client Supabase + configuration + authentification. */

const LS_KEY = 'carnet.config';

/** Config = config.js, surchargeable depuis le navigateur (écran de réglage). */
export function getConfig() {
  const base = window.CARNET_CONFIG || {};
  let over = {};
  try { over = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* ignore */ }
  return {
    supabaseUrl:     (over.supabaseUrl     || base.supabaseUrl     || '').trim().replace(/\/+$/, ''),
    supabaseAnonKey: (over.supabaseAnonKey || base.supabaseAnonKey || '').trim(),
    icsProxy:        (over.icsProxy ?? base.icsProxy ?? '').trim()
  };
}

export function saveConfig(patch) {
  let cur = {};
  try { cur = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* ignore */ }
  localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }));
  _client = null;                       // forcer la recréation du client
}

export function isConfigured() {
  const c = getConfig();
  return /^https?:\/\/.+/.test(c.supabaseUrl) && c.supabaseAnonKey.length > 20;
}

let _client = null;

/** Client Supabase (créé à la demande). */
export function sb() {
  if (_client) return _client;
  const c = getConfig();
  if (!isConfigured()) throw new Error('Supabase non configuré.');
  if (!window.supabase?.createClient) throw new Error('Librairie Supabase non chargée.');
  _client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'carnet.auth'
    },
    global: { headers: { 'x-application-name': 'carnet' } }
  });
  return _client;
}

/* ---------------------------------------------------------- AUTHENTIFICATION */

export async function currentUser() {
  if (!isConfigured()) return null;
  const { data, error } = await sb().auth.getSession();
  if (error) return null;
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(traduireAuth(error.message));
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw new Error(traduireAuth(error.message));
  return data;
}

export async function signOut() {
  try { await sb().auth.signOut(); } catch { /* ignore */ }
}

export function onAuthChange(fn) {
  if (!isConfigured()) return () => {};
  const { data } = sb().auth.onAuthStateChange((event, session) => fn(event, session));
  return () => data.subscription.unsubscribe();
}

function traduireAuth(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "E-mail pas encore confirmé : clique le lien reçu par mail.";
  if (m.includes('user already registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (m.includes('password should be')) return 'Mot de passe trop court (6 caractères minimum).';
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return "Les inscriptions sont désactivées sur ce projet Supabase.";
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Trop de tentatives, réessaie dans quelques minutes.';
  return msg;
}
