/* Recherche et parcours de toutes les feuilles. */

import { icon } from '../icons.js';
import { el, esc, errMsg, debounce } from '../ui.js';
import * as db from '../db.js';
import { state } from '../state.js';
import { sheetGrid, emptyState } from '../components.js';

// Marques diacritiques combinantes (U+0300–U+036F), isolées par normalize('NFD').
const RE_DIACRITIQUES = /[̀-ͯ]/g;

const sansAccents = (s) => String(s || '')
  .normalize('NFD').replace(RE_DIACRITIQUES, '').toLowerCase();

export async function render(params = {}) {
  let toutes = [];
  let q = params.q || '';
  let matiere = params.matiere || '';
  let favoris = params.favoris === '1';
  let aRanger = params.aranger === '1';
  let aFinir  = params.finir === '1';

  const root = el(`
    <div>
      <div class="section-head" style="margin-bottom:12px">
        <h1>${esc(favoris ? 'Favoris' : aRanger ? 'À ranger'
                  : aFinir ? 'À terminer' : 'Toutes les feuilles')}</h1>
      </div>

      <div class="searchbar">
        ${icon('search')}
        <input class="input" data-q value="${esc(q)}"
               placeholder="titre, mot-clé, matière, chapitre…">
      </div>

      <div class="filters" style="margin-bottom:16px">
        <select class="select" data-matiere style="height:36px;min-height:36px;padding:4px 32px 4px 12px;
                font-size:.85rem;width:auto;border-radius:999px">
          <option value="">Toutes les matières</option>
          ${state.subjects.map((s) => `<option value="${esc(s.id)}" ${s.id === matiere ? 'selected' : ''}>
             ${esc(s.code || s.name)}</option>`).join('')}
        </select>
        <button data-f="favoris" class="${favoris ? 'on' : ''}">Favoris</button>
        <button data-f="aranger" class="${aRanger ? 'on' : ''}">À ranger</button>
        <button data-f="finir"   class="${aFinir ? 'on' : ''}">À terminer</button>
      </div>

      <div data-count class="hint" style="margin-bottom:10px"></div>
      <div data-grid>
        <div class="sheet-grid">${'<div class="skeleton" style="height:212px"></div>'.repeat(6)}</div>
      </div>
    </div>`);

  const grid = root.querySelector('[data-grid]');
  const compteur = root.querySelector('[data-count]');

  function filtrer() {
    const mots = sansAccents(q).split(/\s+/).filter(Boolean);
    return toutes.filter((s) => {
      if (matiere && s.subject_id !== matiere) return false;
      if (favoris && !s.starred) return false;
      if (aRanger && s.subject_id) return false;
      if (aFinir && !s.unfinished) return false;
      if (!mots.length) return true;
      const foin = sansAccents([
        s.title, s.note, (s.tags || []).join(' '),
        s.subject_name, s.subject_code, s.chapter_name, s.taken_on
      ].filter(Boolean).join(' '));
      return mots.every((m) => foin.includes(m));
    });
  }

  function dessiner() {
    const res = filtrer();
    compteur.textContent = res.length
      ? `${res.length} feuille${res.length > 1 ? 's' : ''}`
      : '';
    grid.innerHTML = '';
    if (!res.length) {
      grid.appendChild(emptyState({
        ico: q ? 'search' : 'camera',
        title: q ? 'Aucun résultat' : 'Aucune feuille',
        text: q ? `Rien ne correspond à « ${q} ».`
                : 'Scanne ta première feuille pour la retrouver ici.',
        action: q ? null : { label: 'Scanner', icon: 'camera', onClick: () => { location.hash = '#/scan'; } }
      }));
    } else {
      grid.appendChild(sheetGrid(res));
    }
  }

  const majUrl = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (matiere) p.set('matiere', matiere);
    if (favoris) p.set('favoris', '1');
    if (aRanger) p.set('aranger', '1');
    if (aFinir)  p.set('finir', '1');
    const s = p.toString();
    history.replaceState(null, '', `#/recherche${s ? `?${s}` : ''}`);
  };

  root.querySelector('[data-q]').addEventListener('input', debounce((e) => {
    q = e.target.value;
    majUrl();
    dessiner();
  }, 180));

  root.querySelector('[data-matiere]').addEventListener('change', (e) => {
    matiere = e.target.value;
    majUrl();
    dessiner();
  });

  root.querySelector('.filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    if (b.dataset.f === 'favoris') favoris = !favoris;
    else if (b.dataset.f === 'finir') aFinir = !aFinir;
    else aRanger = !aRanger;
    b.classList.toggle('on');
    majUrl();
    dessiner();
  });

  try {
    toutes = await db.listSheets({ limit: 800 });
    dessiner();
  } catch (e) {
    grid.innerHTML = `<div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div>`;
  }

  return root;
}
