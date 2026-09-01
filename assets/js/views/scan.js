/* Scanner une ou plusieurs feuilles, les nettoyer, puis les ranger. */

import { icon } from '../icons.js';
import { el, esc, toast, errMsg, toDay, dateShort } from '../ui.js';
import { loadImage, process, FILTRES } from '../imaging.js';
import { openCropper } from '../cropper.js';
import { openFiler } from '../components.js';
import { state, prefs, setPref, refreshSubjects } from '../state.js';
import { eventsOfDay, currentEvent, matchSubject } from '../ics.js';
import * as db from '../db.js';

export async function render(params = {}) {
  const pages = [];                       // { key, src, rotate, crop, url, name, w, h }
  let filtre = prefs().filtre || 'document';
  let compteur = 0;

  const root = el(`
    <div>
      <div class="section" style="margin-bottom:14px">
        <div class="eyebrow">Nouvelle feuille</div>
        <h1 style="margin-top:4px">Scanner</h1>
      </div>

      <div data-suggestion></div>

      <div class="scan-drop" data-drop>
        <div class="ico">${icon('scan')}</div>
        <h3 style="margin-bottom:4px">Photographie ta feuille</h3>
        <p class="hint" style="margin-bottom:16px">
          Pose-la à plat, cadre large : le nettoyage automatique fait le reste.
        </p>
        <div class="row" style="max-width:420px;margin:0 auto">
          <button class="btn primary" data-cam>${icon('camera')}<span>Appareil photo</span></button>
          <button class="btn" data-lib>${icon('image')}<span>Mes images</span></button>
        </div>
      </div>

      <div class="section hidden" data-editor style="margin-top:18px">
        <div class="section-head">
          <h2>Pages <span class="chip" data-count>0</span></h2>
        </div>
        <div class="filters" data-filters style="margin-bottom:12px"></div>
        <div class="page-strip" data-pages></div>
        <button class="btn block" data-add style="margin-top:12px">
          ${icon('plus')}<span>Ajouter une page</span>
        </button>
      </div>

      <div class="hidden" data-actions style="margin-top:20px">
        <div class="progress hidden" data-progress style="margin-bottom:12px"><i></i></div>
        <button class="btn primary lg block" data-save>
          ${icon('check')}<span>Ranger et enregistrer</span>
        </button>
        <button class="btn ghost block" data-clear style="margin-top:8px">Tout effacer</button>
      </div>

      <input type="file" accept="image/*" capture="environment" class="sr-only" data-input-cam>
      <input type="file" accept="image/*" multiple class="sr-only" data-input-lib>
    </div>`);

  const $ = (s) => root.querySelector(s);
  const editor  = $('[data-editor]');
  const actions = $('[data-actions]');
  const strip   = $('[data-pages]');
  const drop    = $('[data-drop]');

  /* ------------------------------------------- suggestion « cours en cours » */
  let suggestion = null;
  if (params.matiere) {
    suggestion = state.subjects.find((s) => s.id === params.matiere) || null;
  }
  if (!suggestion) {
    const cur = currentEvent(eventsOfDay(state.events, toDay()));
    if (cur) suggestion = matchSubject(cur.event.summary, state.subjects);
    if (suggestion && cur) {
      $('[data-suggestion]').appendChild(el(`
        <div class="banner info" style="margin-bottom:16px">
          ${icon(cur.live ? 'clock' : 'calendar')}
          <div class="grow">
            ${cur.live ? 'Cours en ce moment' : 'Prochain cours'} :
            <strong>${esc(suggestion.code || suggestion.name)}</strong> — proposé par défaut au rangement.
          </div>
        </div>`));
    }
  }

  /* ------------------------------------------------------------- filtres  */
  function drawFilters() {
    $('[data-filters]').innerHTML = FILTRES.map((f) =>
      `<button data-f="${f.id}" class="${f.id === filtre ? 'on' : ''}">${esc(f.label)}</button>`).join('');
  }
  $('[data-filters]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f]');
    if (!b || b.dataset.f === filtre) return;
    filtre = b.dataset.f;
    setPref('filtre', filtre);
    drawFilters();
    await Promise.all(pages.map(refreshPreview));
    drawPages();
  });
  drawFilters();

  /* -------------------------------------------------------------- pages   */
  async function refreshPreview(p) {
    if (p.url) URL.revokeObjectURL(p.url);
    const out = await process(p.src, {
      rotate: p.rotate, crop: p.crop, filter: filtre, maxSize: 760, quality: 0.72
    });
    p.url = out.url;
    p.w = out.width;
    p.h = out.height;
    return p;
  }

  function drawPages() {
    $('[data-count]').textContent = pages.length;
    strip.innerHTML = pages.map((p, i) => `
      <div class="page-item" data-key="${p.key}">
        <div class="pv"><img src="${p.url}" alt=""><span class="num">${i + 1}</span></div>
        <div class="info">
          <div class="nm">${esc(p.name)}</div>
          <div class="sz">${p.w}×${p.h}${p.crop ? ' · recadrée' : ''}${p.rotate ? ` · ${p.rotate}°` : ''}</div>
        </div>
        <div class="acts">
          <button class="icon-btn" data-a="rot"  title="Pivoter">${icon('rotate')}</button>
          <button class="icon-btn" data-a="crop" title="Recadrer">${icon('crop')}</button>
          <button class="icon-btn" data-a="up"   title="Monter">${icon('arrowUp')}</button>
          <button class="icon-btn" data-a="del"  title="Supprimer">${icon('trash')}</button>
        </div>
      </div>`).join('');

    const vide = pages.length === 0;
    editor.classList.toggle('hidden', vide);
    actions.classList.toggle('hidden', vide);
    drop.classList.toggle('hidden', !vide);
  }

  strip.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const key = btn.closest('[data-key]').dataset.key;
    const i = pages.findIndex((p) => p.key === key);
    if (i < 0) return;
    const p = pages[i];

    if (btn.dataset.a === 'rot') {
      p.rotate = (p.rotate + 90) % 360;
      p.crop = null;                       // le cadre ne suit pas la rotation
      await refreshPreview(p);
      drawPages();
    } else if (btn.dataset.a === 'crop') {
      const apercu = await process(p.src, { rotate: p.rotate, filter: 'brut', maxSize: 1100, quality: .8 });
      const res = await openCropper(apercu.url, p.crop);
      URL.revokeObjectURL(apercu.url);
      if (res === null) return;
      p.crop = res === 'reset' ? null : res;
      await refreshPreview(p);
      drawPages();
    } else if (btn.dataset.a === 'up') {
      if (i === 0) return;
      pages.splice(i - 1, 0, pages.splice(i, 1)[0]);
      drawPages();
    } else if (btn.dataset.a === 'del') {
      URL.revokeObjectURL(p.url);
      pages.splice(i, 1);
      drawPages();
    }
  });

  /* ----------------------------------------------------------- ajout fichiers */
  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const chargement = el(`<div class="page-item"><div class="pv skeleton"></div>
      <div class="info"><div class="nm">Préparation…</div></div></div>`);
    editor.classList.remove('hidden');
    drop.classList.add('hidden');
    strip.appendChild(chargement);

    for (const f of files) {
      try {
        const src = await loadImage(f);
        const p = {
          key: `p${++compteur}`, src, rotate: 0, crop: null, url: null,
          name: f.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || `Page ${compteur}`,
          bytes: f.size
        };
        await refreshPreview(p);
        pages.push(p);
      } catch (e) {
        toast(`« ${f.name} » : ${errMsg(e)}`, 'err');
      }
    }
    chargement.remove();
    drawPages();
  }

  $('[data-input-cam]').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  $('[data-input-lib]').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  $('[data-cam]').addEventListener('click', () => $('[data-input-cam]').click());
  $('[data-lib]').addEventListener('click', () => $('[data-input-lib]').click());
  $('[data-add]').addEventListener('click', () => $('[data-input-cam]').click());

  // Glisser-déposer (ordinateur)
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault(); drop.classList.add('hot');
  }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault(); drop.classList.remove('hot');
  }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  /* ---------------------------------------------------------- enregistrement */
  $('[data-clear]').addEventListener('click', () => {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    pages.length = 0;
    drawPages();
  });

  $('[data-save]').addEventListener('click', async () => {
    if (!pages.length) return;
    if (!state.subjects.length) await refreshSubjects();

    const meta = await openFiler({
      suggestion,
      initial: {
        subject_id: suggestion?.id || null,
        title: '',
        taken_on: toDay()
      },
      title: pages.length > 1 ? `Ranger ces ${pages.length} pages` : 'Ranger cette feuille',
      confirmLabel: 'Enregistrer'
    });
    if (!meta) return;

    const bouton = $('[data-save]');
    const barre = $('[data-progress]');
    bouton.disabled = true;
    barre.classList.remove('hidden');
    const avance = (v) => { barre.querySelector('i').style.width = `${Math.round(v * 100)}%`; };

    let sheet = null;
    try {
      const matiere = state.subjects.find((s) => s.id === meta.subject_id);
      const titreAuto = matiere
        ? `${matiere.code || matiere.name} — ${dateShort(meta.taken_on)}`
        : `Feuille du ${dateShort(meta.taken_on)}`;

      sheet = await db.createSheet({
        subject_id: meta.subject_id,
        chapter_id: meta.chapter_id,
        title: meta.title || titreAuto,
        note: meta.note,
        tags: meta.tags,
        taken_on: meta.taken_on
      });
      avance(0.08);

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const out = await process(p.src, {
          rotate: p.rotate, crop: p.crop, filter: filtre, maxSize: 2200, quality: 0.82
        });
        const path = await db.uploadImage(state.user.id, sheet.id, i, out.blob);
        await db.addPage({
          sheet_id: sheet.id, position: i, storage_path: path,
          width: out.width, height: out.height, bytes: out.blob.size
        });
        URL.revokeObjectURL(out.url);
        avance(0.08 + 0.92 * ((i + 1) / pages.length));
      }

      pages.forEach((p) => URL.revokeObjectURL(p.url));
      pages.length = 0;
      toast('Feuille enregistrée');
      location.hash = `#/feuille/${sheet.id}`;
    } catch (e) {
      toast(errMsg(e), 'err');
      bouton.disabled = false;
      barre.classList.add('hidden');
      if (sheet) {
        toast('La feuille a été créée : complète-la depuis sa fiche.', 'err', 4200);
      }
    }
  });

  drawPages();

  // Sur mobile, ouvrir l'appareil photo tout de suite : le geste attendu est
  // « je rentre de cours, je scanne » — un tap de moins.
  if (params.auto === '1') setTimeout(() => $('[data-input-cam]').click(), 220);

  return root;
}
