/* État partagé de l'application (cache mémoire des données peu changeantes). */
import * as db from './db.js';

export const state = {
  user: null,
  subjects: [],                  // matières + compteurs (vue subject_overview)
  chapters: new Map(),           // subject_id -> chapitres
  settings: null,
  events: []                     // emploi du temps mis en cache
};

/** Charge tout ce dont l'app a besoin après connexion. */
export async function bootstrap(user) {
  state.user = user;
  const [subjects, settings] = await Promise.all([
    db.listSubjects(),
    db.getSettings(user.id).catch(() => null)
  ]);
  state.subjects = subjects;
  state.settings = settings;
  state.events = Array.isArray(settings?.ics_events) ? settings.ics_events : [];
  state.chapters.clear();
}

export function reset() {
  state.user = null;
  state.subjects = [];
  state.chapters.clear();
  state.settings = null;
  state.events = [];
}

export async function refreshSubjects() {
  state.subjects = await db.listSubjects();
  return state.subjects;
}

export function subjectById(id) {
  return state.subjects.find((s) => s.id === id) || null;
}

/** Chapitres d'une matière, avec cache. */
export async function chaptersFor(subjectId, { force = false } = {}) {
  if (!subjectId) return [];
  if (!force && state.chapters.has(subjectId)) return state.chapters.get(subjectId);
  const list = await db.listChapters(subjectId);
  state.chapters.set(subjectId, list);
  return list;
}

export function invalidateChapters(subjectId) {
  if (subjectId) state.chapters.delete(subjectId);
  else state.chapters.clear();
}

/** Enregistre des réglages et met l'état local à jour. */
export async function patchSettings(patch) {
  const row = await db.saveSettings(state.user.id, patch);
  state.settings = row;
  if (patch.ics_events) state.events = row.ics_events || [];
  return row;
}

/* --- Préférences locales (thème, options de scan) : navigateur uniquement --- */

const PREFS = 'carnet.prefs';

export function prefs() {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}

export function setPref(key, value) {
  const p = prefs();
  p[key] = value;
  localStorage.setItem(PREFS, JSON.stringify(p));
  return p;
}
