/* Helpers d'interface : DOM, modales, toasts, formats de date. */
import { icon } from './icons.js';

/* ------------------------------------------------------------------- DOM  */

/** Échappe une chaîne destinée à être injectée en HTML. */
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Construit un élément à partir d'une chaîne HTML. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Construit un fragment (plusieurs racines). */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

/** Délégation d'événements : on(root, 'click', '[data-act="x"]', fn). */
export function on(root, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const target = e.target.closest(sel);
    if (target && root.contains(target)) fn(e, target);
  });
}

export function debounce(fn, ms = 260) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ----------------------------------------------------------------- TOAST  */

export function toast(msg, kind = 'ok', ms = 2900) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const ic = kind === 'err' ? 'alert' : 'check';
  const node = el(`<div class="toast ${kind === 'err' ? 'err' : 'ok'}">${icon(ic)}<span>${esc(msg)}</span></div>`);
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/* ---------------------------------------------------------------- MODALE  */

/**
 * Ouvre une feuille modale.
 * @param {{title:string, body:Node|string, actions?:Array, onClose?:Function,
 *          dismissable?:boolean}} opts
 * @returns {{root:HTMLElement, close:Function, body:HTMLElement}}
 */
export function openModal({ title, body, actions = [], onClose, dismissable = true }) {
  const scrim = el(`
    <div class="scrim" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="grabber"></div>
        <div class="m-head">
          <h2>${esc(title)}</h2>
          <button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button>
        </div>
        <div class="m-body"></div>
      </div>
    </div>`);

  const bodyEl = scrim.querySelector('.m-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  if (actions.length) {
    const foot = el('<div class="m-foot"></div>');
    actions.forEach((a) => {
      const b = el(`<button class="btn ${a.kind || ''}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`);
      b.addEventListener('click', () => a.onClick?.({ close, button: b }));
      if (a.ref) a.ref(b);
      foot.appendChild(b);
    });
    scrim.querySelector('.modal').appendChild(foot);
  }

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    scrim.dataset.closing = '1';
    scrim.style.transition = 'opacity .16s';
    scrim.style.opacity = '0';
    setTimeout(() => scrim.remove(), 170);
    // Une modale peut en avoir ouvert une autre : ne rendre le défilement
    // au document que lorsque plus aucune n'est ouverte.
    document.body.style.overflow =
      document.querySelector('.scrim:not([data-closing])') ? 'hidden' : '';
    document.removeEventListener('keydown', onKey);
    onClose?.(result);
  }
  function onKey(e) {
    if (e.key !== 'Escape' || !dismissable) return;
    const open = document.querySelectorAll('.scrim:not([data-closing])');
    if (open[open.length - 1] === scrim) close();     // seule la modale du dessus
  }

  scrim.querySelector('[data-close]').addEventListener('click', () => close());
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim && dismissable) close(); });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(scrim);

  // Focus du premier champ pour éviter un tap de plus sur mobile.
  setTimeout(() => {
    const f = bodyEl.querySelector('input, textarea, select, button');
    if (f && window.matchMedia('(min-width: 900px)').matches) f.focus();
  }, 60);

  return { root: scrim, body: bodyEl, close };
}

/** Confirmation oui/non. Renvoie une Promise<boolean>. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: `<p style="color:var(--txt-2);margin:0">${esc(message)}</p>`,
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Annuler', onClick: ({ close }) => { done = true; resolve(false); close(); } },
        {
          label: confirmLabel, kind: danger ? 'danger' : 'primary',
          onClick: ({ close }) => { done = true; resolve(true); close(); }
        }
      ]
    });
    return m;
  });
}

/** Petite saisie texte. Renvoie une Promise<string|null>. */
export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Valider' }) {
  return new Promise((resolve) => {
    let done = false;
    const body = el(`
      <div class="field" style="margin:0">
        <label>${esc(label)}</label>
        <input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}">
      </div>`);
    const input = body.querySelector('input');
    const finish = (close) => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      done = true; resolve(v); close();
    };
    const m = openModal({
      title, body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Annuler', onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: confirmLabel, kind: 'primary', onClick: ({ close }) => finish(close) }
      ]
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(m.close); });
    setTimeout(() => input.focus(), 80);
  });
}

/** Redessine la page courante (après une modification de données). */
export function rerender() {
  window.dispatchEvent(new CustomEvent('carnet:rerender'));
}

/* ------------------------------------------------------------------ DATES */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
               'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** 'YYYY-MM-DD' -> Date locale (évite le décalage UTC de new Date('...')). */
export function parseDay(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Date -> 'YYYY-MM-DD' (fuseau local). */
export function toDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** « lundi 1 septembre » */
export function dateLong(d) {
  d = parseDay(d); if (!d) return '';
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** « 1 sept. » (+ année si différente de l'année courante) */
export function dateShort(d) {
  d = parseDay(d); if (!d) return '';
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MOIS_C[d.getMonth()]}${y}`;
}

/** « aujourd'hui », « hier », « il y a 4 j », sinon date courte. */
export function dateRelative(d) {
  const day = parseDay(d); if (!day) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  if (diff === 2) return 'avant-hier';
  if (diff > 2 && diff < 7) return `il y a ${diff} jours`;
  if (diff === -1) return 'demain';
  return dateShort(day);
}

/** Date -> « 14:05 » */
export function hhmm(d) {
  if (!(d instanceof Date)) d = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* --------------------------------------------------------------- DIVERS   */

/** Palette de couleurs pour les matières. */
export const PALETTE = [
  '#5b5bd6', '#0f8a6d', '#c2410c', '#b4306b', '#0369a1',
  '#7c3aed', '#a16207', '#0e7490', '#be123c', '#4d7c0f',
  '#9333ea', '#1d4ed8', '#b45309', '#0d9488', '#db2777'
];

/** Couleur stable dérivée d'une chaîne (matières créées sans couleur). */
export function colorFor(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Abréviation affichée dans la pastille d'une matière. */
export function subjectBadge(s) {
  if (s?.code) return s.code.replace(/^SA[EÉ]\s*/i, 'S').replace(/\s+/g, '');
  const w = String(s?.name || '?').split(/\s+/).filter(Boolean);
  return (w[0]?.[0] || '?').toUpperCase() + (w[1]?.[0] || '').toUpperCase();
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1048576).toFixed(1)} Mo`;
}

/** Empêche l'écran de rester bloqué si une promesse échoue en silence. */
export function errMsg(e) {
  const m = e?.message || String(e || 'Erreur inconnue');
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Pas de connexion au serveur.';
  if (/JWT|token/i.test(m)) return 'Session expirée, reconnecte-toi.';
  if (/row-level security|violates/i.test(m)) return 'Action refusée par la base (RLS).';
  return m;
}
