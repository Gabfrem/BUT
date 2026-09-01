/* Point d'entrée : thème, session, coquille de l'app et routage. */

import { icon } from './icons.js';
import { el, esc, errMsg } from './ui.js';
import { isConfigured, currentUser, onAuthChange } from './supa.js';
import { state, bootstrap, prefs } from './state.js';
import { renderSetup, renderLogin } from './views/auth.js';
import { appliquerTheme } from './views/settings.js';

/* ------------------------------------------------------------- ROUTES     */

const ROUTES = [
  { p: /^\/?$/,                titre: 'Accueil',         onglet: 'accueil',   racine: true,  vue: () => import('./views/home.js') },
  { p: /^\/scan$/,             titre: 'Scanner',         onglet: 'scan',      racine: true,  vue: () => import('./views/scan.js') },
  { p: /^\/matieres$/,         titre: 'Matières',        onglet: 'matieres',  racine: true,  vue: () => import('./views/library.js') },
  { p: /^\/matiere\/([^/]+)$/, titre: 'Matière',         onglet: 'matieres',  racine: false, vue: () => import('./views/subject.js'), args: ['id'] },
  { p: /^\/feuille\/([^/]+)$/, titre: 'Feuille',         onglet: '',          racine: false, vue: () => import('./views/sheet.js'),   args: ['id'] },
  { p: /^\/recherche$/,        titre: 'Recherche',       onglet: 'recherche', racine: true,  vue: () => import('./views/search.js') },
  { p: /^\/edt$/,              titre: 'Emploi du temps', onglet: 'accueil',   racine: false, vue: () => import('./views/edt.js') },
  { p: /^\/reglages$/,         titre: 'Réglages',        onglet: 'reglages',  racine: true,  vue: () => import('./views/settings.js') }
];

function analyserHash() {
  const brut = location.hash.replace(/^#/, '') || '/';
  const [chemin, requete = ''] = brut.split('?');
  const params = Object.fromEntries(new URLSearchParams(requete));
  for (const r of ROUTES) {
    const m = chemin.match(r.p);
    if (m) {
      (r.args || []).forEach((nom, i) => { params[nom] = decodeURIComponent(m[i + 1]); });
      return { route: r, params, chemin };
    }
  }
  return { route: ROUTES[0], params: {}, chemin: '/' };
}

/* ------------------------------------------------------------- COQUILLE   */

function coquille() {
  return el(`
    <div style="display:contents">
      <header class="app-head">
        <button class="icon-btn hidden" data-back aria-label="Retour">${icon('chevronL')}</button>
        <div class="title" data-titre>Carnet</div>
        <div class="spacer"></div>
        <a class="icon-btn" href="#/recherche" aria-label="Rechercher">${icon('search')}</a>
      </header>

      <main data-main></main>

      <nav class="nav">
        <span class="brand">${icon('book')} Carnet</span>
        <a href="#/" data-onglet="accueil">${icon('home')}<span>Accueil</span></a>
        <a href="#/matieres" data-onglet="matieres">${icon('books')}<span>Matières</span></a>
        <span class="fab-slot">
          <a class="fab" href="#/scan" aria-label="Scanner">${icon('camera')}<span class="lbl">Scanner</span></a>
        </span>
        <a href="#/recherche" data-onglet="recherche">${icon('search')}<span>Chercher</span></a>
        <a href="#/reglages" data-onglet="reglages">${icon('settings')}<span>Réglages</span></a>
      </nav>
    </div>`);
}

/* ------------------------------------------------------------- RENDU      */

let rendus = 0;

async function afficher() {
  const { route, params } = analyserHash();
  const main = document.querySelector('[data-main]');
  if (!main) return;

  document.querySelector('[data-titre]').textContent = route.titre;
  document.querySelectorAll('[data-onglet]').forEach((a) =>
    a.classList.toggle('on', a.dataset.onglet === route.onglet));
  document.querySelector('[data-back]').classList.toggle('hidden', route.racine !== false);

  const jeton = ++rendus;
  main.innerHTML = `<div class="skeleton" style="height:120px;margin-bottom:12px"></div>
                    <div class="skeleton" style="height:220px"></div>`;
  try {
    const mod = await route.vue();
    const node = await mod.render(params);
    if (jeton !== rendus) return;             // une navigation plus récente a pris la main
    main.innerHTML = '';
    main.appendChild(node);
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="banner">${icon('alert')}
      <div class="grow"><strong>Page indisponible.</strong><br>${esc(errMsg(e))}</div></div>`;
  }
}

/* ------------------------------------------------------------- DÉMARRAGE  */

async function demarrer() {
  appliquerTheme(prefs().theme || 'auto');
  const app = document.getElementById('app');

  if (!isConfigured()) {
    app.innerHTML = '';
    app.appendChild(renderSetup());
    return;
  }

  let user;
  try {
    user = await currentUser();
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(el(`<div class="center-page"><div class="box">
      <div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div></div></div>`));
    return;
  }

  if (!user) {
    app.innerHTML = '';
    app.appendChild(renderLogin());
    onAuthChange((event) => { if (event === 'SIGNED_IN') location.reload(); });
    return;
  }

  try {
    await bootstrap(user);
  } catch (e) {
    app.innerHTML = '';
    app.appendChild(el(`
      <div class="center-page"><div class="box">
        <h2 style="margin-bottom:10px">Base de données incomplète</h2>
        <div class="banner" style="margin-bottom:14px">${icon('alert')}
          <div class="grow">${esc(errMsg(e))}</div></div>
        <p style="color:var(--txt-2);font-size:.9rem">
          Exécute <code>sql/01_schema.sql</code> puis <code>sql/02_storage.sql</code>
          dans le SQL Editor de Supabase, puis recharge cette page.
        </p>
        <button class="btn primary block" onclick="location.reload()" style="margin-top:14px">
          Recharger</button>
      </div></div>`));
    return;
  }

  app.innerHTML = '';
  app.appendChild(coquille());

  document.querySelector('[data-back]').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  });

  window.addEventListener('hashchange', afficher);
  window.addEventListener('carnet:rerender', afficher);
  onAuthChange((event) => {
    if (event === 'SIGNED_OUT') location.reload();
  });

  await afficher();
  enregistrerServiceWorker();
  rafraichirEdt();
}

/**
 * Rafraîchit l'emploi du temps en arrière-plan si le cache date de plus de
 * douze heures. Silencieux : un planning inaccessible ne doit pas polluer
 * l'écran, le bouton « Synchroniser » des réglages reste là pour le manuel.
 */
async function rafraichirEdt() {
  const s = state.settings;
  if (!s?.ics_url) return;
  const age = s.ics_synced_at ? Date.now() - new Date(s.ics_synced_at).getTime() : Infinity;
  if (age < 12 * 3600 * 1000) return;
  try {
    const { synchroniserEdt } = await import('./views/settings.js');
    const n = await synchroniserEdt();
    console.info(`Emploi du temps rafraîchi : ${n} cours.`);
    const { chemin } = analyserHash();
    if (chemin === '/' || chemin === '/edt') afficher();
  } catch (e) {
    console.info('Emploi du temps non rafraîchi :', e.message);
  }
}

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const base = location.pathname.replace(/[^/]*$/, '');
  navigator.serviceWorker.register(`${base}sw.js`).catch(() => { /* sans gravité */ });
}

demarrer().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    `<div class="center-page"><div class="box"><div class="banner">
       ${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div></div></div>`;
});
