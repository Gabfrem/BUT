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

/**
 * Jusqu'à quand l'emploi du temps en cache va-t-il ?
 * Un export ICS couvre une période finie (souvent un semestre) : passé sa
 * dernière date, l'accueil se viderait sans explication.
 * @returns {{fin:Date, joursRestants:number}|null}
 */
export function couverture(events) {
  if (!events?.length) return null;
  const fin = events.reduce((max, e) => {
    const d = new Date(e.end || e.start);
    return d > max ? d : max;
  }, new Date(0));
  if (isNaN(fin) || fin.getTime() === 0) return null;
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  return { fin, joursRestants: Math.ceil((fin - aujourdhui) / 86400000) };
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

/**
 * Intitulé nettoyé pour l'affichage.
 * Les plannings universitaires produisent des libellés du genre
 *   « INFFIS01R1.04 INTRODUCTION AUX BASES DE DONNEES (T3BUTINFFIS01R1.04) »
 * dont seul le milieu intéresse un humain.
 */
export function prettySummary(summary) {
  let s = String(summary || '')
    .replace(/\([^)]*\)/g, ' ')                                   // codes entre parenthèses
    .replace(/\b[A-Z0-9]*(?:R\d\.?\d{2}|SA[EÉ]\s?\d\.?\d{2})\b/gi, ' ')  // codes de ressource
    .replace(/^\s*(CM|TD|TP|DS|AUTO|RES)\s*[:\-–]?\s*/i, '')      // type de séance en tête
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
    .trim();
  // Beaucoup de plannings crient en majuscules : on redescend en casse normale.
  if (s && s === s.toUpperCase() && s.length > 4) {
    s = s.charAt(0) + s.slice(1).toLowerCase();
  }
  return s || summary;
}

/** Type de séance repéré dans l'intitulé : CM, TD, TP, DS… */
export function sessionType(summary) {
  const m = norm(summary).match(/\b(CM|TD|TP|DS|AUTO|RES|EXAMEN|PROJET|SOUTENANCE)\b/);
  if (!m) return null;
  const t = m[1];
  const jolis = { AUTO: 'Autonomie', RES: 'Réservation', EXAMEN: 'Examen',
                  PROJET: 'Projet', SOUTENANCE: 'Soutenance' };
  return jolis[t] || t;
}

/**
 * Titre à afficher pour un événement.
 * Ordre de préférence : le nom de la matière reconnue (le plus lisible),
 * puis le commentaire du planning (les réservations « RES » n'ont que ça :
 * « Commentaire : +Rentrée »), puis l'intitulé nettoyé.
 */
export function eventLabel(ev, subject = null) {
  if (subject?.name) return subject.name;
  const commentaire = String(ev?.description || '')
    .match(/Commentaire\s*:\s*\+?\s*([^\n]+)/i);
  if (commentaire) return commentaire[1].trim();
  return prettySummary(ev?.summary);
}

/**
 * Liste les matières présentes dans un emploi du temps.
 * Les intitulés ressemblent à
 *   « CM : INFFIS01R1.01 INITIATION AU DEV. (T3BUTINFFIS01R1.01) »
 * dont on extrait le code (R1.01) et le libellé (INITIATION AU DEV.).
 * @returns {Array<{code:string, name:string, kind:string, semester:string|null}>}
 */
export function subjectsFromEvents(events) {
  const trouvees = new Map();
  const motif = /(R\d\.\d{2}|SA[EÉ]\s?\d\.\d{2})\s+([^(\n]+?)\s*(?:\(|$)/i;

  for (const ev of events || []) {
    const m = String(ev?.summary || '').match(motif);
    if (!m) continue;
    const code = m[1].toUpperCase().replace(/^SAE/, 'SAÉ').replace(/^SAÉ(\d)/, 'SAÉ $1');
    const libelle = m[2].trim().replace(/\s{2,}/g, ' ');
    if (!libelle) continue;
    const cle = codeKey(code);
    if (!trouvees.has(cle)) {
      trouvees.set(cle, {
        code,
        name: casseNormale(libelle),
        kind: /^SA/i.test(code) ? 'sae' : 'ressource',
        semester: code.match(/(\d)\.\d{2}/) ? `S${code.match(/(\d)\.\d{2}/)[1]}` : null
      });
    }
  }
  return [...trouvees.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Clé de comparaison entre deux codes de matière ('R1.01' ≡ 'r101'). */
export function codeKey(code) {
  return squash(code);
}

// Sigles à laisser en capitales quand on redescend un intitulé tout en majuscules.
const SIGLES = new Set(['PPP', 'BD', 'BDD', 'SQL', 'IHM', 'UML', 'HTML', 'CSS', 'JS',
  'API', 'OS', 'IP', 'IA', 'SAE', 'TP', 'TD', 'CM', 'QCM', 'RH', 'SI']);

/** « INITIATION AU DEV. » -> « Initiation au dev. » ; « INTRODUCTION BD » -> « Introduction BD ». */
function casseNormale(s) {
  const t = String(s || '').trim();
  if (t !== t.toUpperCase()) return t;          // déjà en casse mixte : on n'y touche pas
  const mots = t.split(/(\s+)/).map((mot, i) => {
    if (/^\s+$/.test(mot) || !mot) return mot;
    const noyau = mot.replace(/[^A-ZÀ-Ÿ]/gi, '');
    if (SIGLES.has(noyau)) return mot;          // sigle : on garde les capitales
    const bas = mot.toLowerCase();
    return i === 0 ? bas.charAt(0).toUpperCase() + bas.slice(1) : bas;
  });
  return mots.join('');
}
