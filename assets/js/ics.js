/* Emploi du temps : lecture d'un flux ICS (ADE / Hyperplanning / Google…). */
import { getConfig, sb } from './supa.js';

/* ------------------------------------------------------------- PARSEUR   */

/** Déplie les lignes ICS (une ligne longue est coupée + préfixée d'une espace). */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

/** Déséchappe une valeur TEXT ICS. */
function untext(v = '') {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',')
          .replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

/**
 * Convertit une valeur de date ICS en Date.
 *  - 20260901T080000Z  -> UTC
 *  - 20260901T080000   -> heure locale (cas TZID=Europe/Paris, navigateur en France)
 *  - 20260901          -> journée entière
 */
function icsDate(value, params = '') {
  const v = (value || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  const allDay = hh === undefined || /VALUE=DATE(?!-TIME)/i.test(params);
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss)), allDay: false };
  return {
    date: new Date(+y, +mo - 1, +d, +(hh || 0), +(mi || 0), +(ss || 0)),
    allDay
  };
}

/**
 * Parse un fichier ICS et renvoie une liste d'événements normalisés.
 * @returns {Array<{uid,start,end,summary,location,description,allDay}>}
 */
export function parseIcs(text) {
  const lines = unfold(String(text || '')).split('\n');
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.start) {
        if (!cur.end) cur.end = new Date(cur.start.getTime() + 3600000);
        events.push({
          uid: cur.uid || `${+cur.start}-${cur.summary || ''}`,
          start: cur.start.toISOString(),
          end: cur.end.toISOString(),
          summary: cur.summary || 'Cours',
          location: cur.location || '',
          description: cur.description || '',
          allDay: !!cur.allDay
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const left = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const name = left.split(';')[0].toUpperCase();
    const params = left.slice(name.length);

    switch (name) {
      case 'UID':         cur.uid = value.trim(); break;
      case 'SUMMARY':     cur.summary = untext(value); break;
      case 'LOCATION':    cur.location = untext(value); break;
      case 'DESCRIPTION': cur.description = untext(value); break;
      case 'DTSTART': {
        const r = icsDate(value, params);
        if (r) { cur.start = r.date; cur.allDay = r.allDay; }
        break;
      }
      case 'DTEND': {
        const r = icsDate(value, params);
        if (r) cur.end = r.date;
        break;
      }
      default: break;
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

/* --------------------------------------------------------- RÉCUPÉRATION  */

const RELAIS_PUBLICS = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
];

/**
 * Télécharge un ICS. ADE bloque généralement les requêtes navigateur (CORS),
 * d'où les stratégies de repli.
 * @param {string} url
 * @param {{allowPublicRelay?:boolean}} opts
 * @returns {Promise<{text:string, via:string}>}
 */
export async function fetchIcs(url, { allowPublicRelay = false } = {}) {
  const clean = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(clean)) throw new Error('Lien ICS invalide (il doit commencer par https://).');

  const attempts = [];
  const { icsProxy } = getConfig();

  // 1) Edge Function dédiée (recommandé : fiable et privé)
  if (icsProxy) {
    attempts.push(async () => {
      const { data } = await sb().auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch(`${icsProxy}?url=${encodeURIComponent(clean)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!r.ok) throw new Error(`Relais Supabase : HTTP ${r.status}`);
      return { text: await r.text(), via: 'Edge Function' };
    });
  }

  // 2) Accès direct (fonctionne si le serveur autorise le CORS)
  attempts.push(async () => {
    const r = await fetch(clean, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), via: 'direct' };
  });

  // 3) Relais publics (uniquement si explicitement autorisé)
  if (allowPublicRelay) {
    for (const make of RELAIS_PUBLICS) {
      attempts.push(async () => {
        const r = await fetch(make(clean));
        if (!r.ok) throw new Error(`Relais public : HTTP ${r.status}`);
        return { text: await r.text(), via: 'relais public' };
      });
    }
  }

  let last;
  for (const run of attempts) {
    try {
      const res = await run();
      if (!/BEGIN:VCALENDAR/i.test(res.text)) throw new Error("La réponse n'est pas un calendrier ICS.");
      return res;
    } catch (e) { last = e; }
  }
  throw new Error(
    `Impossible de récupérer l'emploi du temps (${last?.message || 'erreur réseau'}). ` +
    `Le serveur de ton université bloque probablement les requêtes directes : ` +
    `installe l'Edge Function « ics-proxy », ou importe le fichier .ics à la main.`
  );
}

/* ------------------------------------------------------- EXPLOITATION    */

/** Événements d'un jour donné ('YYYY-MM-DD'), triés par heure. */
export function eventsOfDay(events, dayStr) {
  return (events || []).filter((e) => {
    const d = new Date(e.start);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` === dayStr;
  }).sort((a, b) => a.start.localeCompare(b.start));
}

/** Événements sur une plage de jours (bornes incluses). */
export function eventsBetween(events, fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T23:59:59`);
  return (events || [])
    .filter((e) => { const d = new Date(e.start); return d >= from && d <= to; })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Le cours en cours à l'instant t, sinon le prochain de la journée. */
export function currentEvent(events, now = new Date()) {
  const list = (events || []).map((e) => ({ ...e, s: new Date(e.start), e2: new Date(e.end) }));
  const live = list.find((x) => x.s <= now && now <= x.e2);
  if (live) return { event: live, live: true };
  const next = list.filter((x) => x.s > now).sort((a, b) => a.s - b.s)[0];
  return next ? { event: next, live: false } : null;
}

/* ------------------------------------- RAPPROCHEMENT ÉVÉNEMENT ↔ MATIÈRE  */

// Marques diacritiques combinantes (U+0300 à U+036F), isolées par normalize('NFD').
const RE_DIACRITIQUES = /[̀-ͯ]/g;

const norm = (s) => String(s || '')
  .normalize('NFD').replace(RE_DIACRITIQUES, '')
  .toUpperCase();

const squash = (s) => norm(s).replace(/[^A-Z0-9]/g, '');

const MOTS_VIDES = new Set(['DE', 'DES', 'DU', 'LA', 'LE', 'LES', 'ET', 'A', 'AU', 'AUX',
  'EN', 'UN', 'UNE', 'POUR', 'SUR', 'DANS', 'INTRODUCTION', 'INITIATION', 'COURS',
  'TD', 'TP', 'CM', 'GR', 'GROUPE', 'BUT', 'INFO', 'INFORMATIQUE', 'S1', 'S2']);

/**
 * Retrouve la matière correspondant à un intitulé de cours ADE.
 * Ex. « R1.01 - Initiation au développement TP Gr.B » -> matière R1.01
 * @returns {object|null}
 */
export function matchSubject(summary, subjects) {
  if (!summary || !subjects?.length) return null;
  const hay = squash(summary);

  // 1) Code exact (R1.01 / R101 / SAE1.02 / SAE102)
  for (const s of subjects) {
    if (!s.code) continue;
    const c = squash(s.code);
    if (c.length >= 3 && hay.includes(c)) return s;
  }

  // 2) Recouvrement de mots significatifs du libellé
  const mots = norm(summary).split(/[^A-Z0-9]+/).filter((w) => w.length > 3 && !MOTS_VIDES.has(w));
  let best = null, bestScore = 0;
  for (const s of subjects) {
    const cible = new Set(norm(s.name).split(/[^A-Z0-9]+/).filter((w) => w.length > 3 && !MOTS_VIDES.has(w)));
    if (!cible.size) continue;
    let hit = 0;
    for (const w of mots) if (cible.has(w)) hit++;
    const score = hit / cible.size;
    if (hit >= 1 && score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Intitulé nettoyé pour l'affichage (retire le code redondant). */
export function prettySummary(summary) {
  return String(summary || '')
    .replace(/^\s*(R\d\.?\d{2}|SA[EÉ]\s*\d\.?\d{2})\s*[-–—:]?\s*/i, '')
    .trim() || summary;
}
