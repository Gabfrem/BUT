/* Page « Matières » : le classeur, vue d'ensemble. */

import { icon } from '../icons.js';
import { el, esc, toast, errMsg } from '../ui.js';
import { state, refreshSubjects } from '../state.js';
import { subjectRowHtml, openSubjectEditor } from '../components.js';
import { seedRows } from '../seed.js';
import * as db from '../db.js';

export async function render() {
  const root = el(`
    <div>
      <div class="section-head" style="margin-bottom:14px">
        <h1>Matières</h1>
        <button class="btn sm" data-new>${icon('plus')}<span>Nouvelle</span></button>
      </div>
      <div class="list" style="margin-bottom:22px" data-quick></div>
      <div data-body></div>
    </div>`);

  root.querySelector('[data-new]').addEventListener('click', async () => {
    const s = await openSubjectEditor();
    if (s) draw();
  });

  /* --------------------------------------------------------- accès rapides */
  const quick = root.querySelector('[data-quick]');
  quick.innerHTML = `
    <a class="row-item" href="#/recherche">
      <span class="swatch" style="background:var(--bg-3);color:var(--txt-2)">${icon('grid')}</span>
      <span class="grow"><span class="ttl">Toutes les feuilles</span>
        <span class="sub">parcourir et rechercher</span></span>
      <span class="chev">${icon('chevronR')}</span>
    </a>
    <a class="row-item" href="#/recherche?favoris=1">
      <span class="swatch" style="background:#ffca45;color:#5a3d00">${icon('star')}</span>
      <span class="grow"><span class="ttl">Favoris</span>
        <span class="sub">les feuilles marquées d'une étoile</span></span>
      <span class="chev">${icon('chevronR')}</span>
    </a>
    <a class="row-item hidden" href="#/recherche?aranger=1" data-unfiled>
      <span class="swatch" style="background:var(--warn-2);color:var(--warn)">${icon('inbox')}</span>
      <span class="grow"><span class="ttl">À ranger</span>
        <span class="sub" data-unfiled-sub></span></span>
      <span class="chev">${icon('chevronR')}</span>
    </a>`;

  db.countSheets({ unfiled: true }).then((n) => {
    if (!n) return;
    const row = quick.querySelector('[data-unfiled]');
    row.classList.remove('hidden');
    row.querySelector('[data-unfiled-sub]').textContent =
      `${n} feuille${n > 1 ? 's' : ''} sans matière`;
  }).catch(() => {});

  /* ------------------------------------------------------------- matières */
  const body = root.querySelector('[data-body]');

  function draw() {
    body.innerHTML = '';
    if (!state.subjects.length) {
      body.appendChild(ecranVide());
      return;
    }
    const groupes = new Map();
    state.subjects.forEach((s) => {
      const cle = s.semester || 'Autres';
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(s);
    });
    [...groupes.keys()].sort().forEach((cle) => {
      const sec = el(`
        <div class="section">
          <div class="section-head"><h2>${esc(cle === 'Autres' ? 'Autres matières' : `Semestre ${cle.slice(1)}`)}</h2>
            <span class="chip">${groupes.get(cle).length}</span></div>
          <div class="list"></div>
        </div>`);
      sec.querySelector('.list').innerHTML = groupes.get(cle).map(subjectRowHtml).join('');
      body.appendChild(sec);
    });
  }

  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-subject]');
    if (row) location.hash = `#/matiere/${row.dataset.subject}`;
  });

  function ecranVide() {
    const box = el(`
      <div>
        <div class="empty" style="margin-bottom:14px">
          <div class="ico">${icon('books')}</div>
          <h3>Aucune matière</h3>
          <p>Pré-remplis le programme de BUT 1 — tu pourras tout renommer ensuite —
             ou crée tes matières une par une.</p>
          <div class="row" style="max-width:340px;margin:0 auto">
            <button class="btn primary" data-seed="S1">Semestre 1</button>
            <button class="btn primary" data-seed="S2">Semestre 2</button>
          </div>
        </div>
        <button class="btn block" data-manual>${icon('plus')} Créer une matière</button>
      </div>`);
    box.addEventListener('click', async (e) => {
      const seed = e.target.closest('[data-seed]');
      if (seed) {
        seed.disabled = true;
        try {
          await db.createSubjects(seedRows(seed.dataset.seed, state.subjects.length));
          await refreshSubjects();
          toast(`Matières du ${seed.dataset.seed} ajoutées`);
          draw();
        } catch (err) { seed.disabled = false; toast(errMsg(err), 'err'); }
        return;
      }
      if (e.target.closest('[data-manual]')) {
        const s = await openSubjectEditor();
        if (s) draw();
      }
    });
    return box;
  }

  draw();
  return root;
}
