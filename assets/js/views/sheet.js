/* Fiche d'une feuille scannée : ses pages, son rangement, ses actions. */

import { icon, iconStarFilled } from '../icons.js';
import { el, esc, toast, errMsg, dateLong, dateRelative, colorFor,
         confirmDialog, rerender } from '../ui.js';
import * as db from '../db.js';
import { state } from '../state.js';
import { openFiler } from '../components.js';
import { openTranscription } from '../transcription.js';
import { loadImage, process } from '../imaging.js';

export async function render(params) {
  const root = el('<div></div>');
  let feuille, pages = [];

  try {
    [feuille, pages] = await Promise.all([db.getSheet(params.id), db.listPages(params.id)]);
  } catch (e) {
    root.appendChild(el(`<div class="empty"><div class="ico">${icon('alert')}</div>
      <h3>Feuille introuvable</h3><p>${esc(errMsg(e))}</p></div>`));
    return root;
  }

  const couleur = feuille.subject_color || colorFor(feuille.subject_name || 'x');

  root.innerHTML = `
    <div style="margin-bottom:16px">
      <div class="chips" style="margin-bottom:9px">
        ${feuille.subject_name
          ? `<a class="chip" href="#/matiere/${esc(feuille.subject_id)}"
               style="background:${esc(couleur)}22;color:${esc(couleur)}">
               ${esc(feuille.subject_code || feuille.subject_name)}</a>`
          : '<span class="chip warn">À ranger</span>'}
        ${feuille.chapter_name ? `<span class="chip">${esc(feuille.chapter_name)}</span>` : ''}
        <span class="chip">${esc(dateRelative(feuille.taken_on))}</span>
      </div>
      <h1 style="font-size:1.32rem">${esc(feuille.title || 'Sans titre')}</h1>
      <div style="color:var(--txt-3);font-size:.84rem;margin-top:3px">
        ${esc(dateLong(feuille.taken_on))} · ${pages.length} page${pages.length > 1 ? 's' : ''}
      </div>
    </div>

    ${feuille.note ? `<div class="card pad" style="margin-bottom:16px;white-space:pre-wrap;
        font-size:.92rem;color:var(--txt-2)">${esc(feuille.note)}</div>` : ''}

    ${feuille.tags?.length ? `<div class="chips" style="margin-bottom:16px">
        ${feuille.tags.map((t) => `<a class="chip accent" href="#/recherche?q=${encodeURIComponent(t)}">
           ${icon('tag')}${esc(t)}</a>`).join('')}</div>` : ''}

    <div data-unfinished-banner></div>

    <div class="btn-row" style="margin-bottom:18px">
      <button class="btn" data-star>${feuille.starred ? iconStarFilled() : icon('star')}
        <span>${feuille.starred ? 'Favori' : 'Marquer'}</span></button>
      <button class="btn" data-todo></button>
      <button class="btn" data-ocr>${icon('file')}<span>Texte</span></button>
      <button class="btn" data-file>${icon('folder')}<span>Ranger</span></button>
      <button class="btn" data-add>${icon('plus')}<span>Page</span></button>
      <button class="btn danger" data-del>${icon('trash')}<span>Supprimer</span></button>
    </div>

    <div class="progress hidden" data-progress style="margin-bottom:12px"><i></i></div>
    <div data-texte style="margin-bottom:18px"></div>
    <div data-pages class="list"></div>
    <input type="file" accept="image/*" capture="environment" class="sr-only" data-input>`;

  /* ------------------------------------------------------------- les pages */
  const zone = root.querySelector('[data-pages]');

  async function dessinerPages() {
    if (!pages.length) {
      zone.innerHTML = `<div class="empty"><div class="ico">${icon('image')}</div>
        <h3>Aucune page</h3><p>Ajoute une photo à cette feuille.</p></div>`;
      return;
    }
    zone.innerHTML = pages.map((p, i) => `
      <div class="card" style="overflow:hidden;position:relative" data-page="${i}">
        <img data-path="${esc(p.storage_path)}" alt="Page ${i + 1}"
             style="width:100%;display:block;background:var(--bg-3);min-height:120px;cursor:zoom-in">
        <span class="badge" style="position:absolute;left:10px;top:10px;background:rgba(8,10,18,.72);
              color:#fff;font-size:.7rem;font-weight:650;padding:3px 8px;border-radius:999px">
          ${i + 1}/${pages.length}</span>
        <button class="icon-btn" data-page-del="${esc(p.id)}"
                style="position:absolute;right:8px;top:8px;background:rgba(8,10,18,.6);color:#fff">
          ${icon('trash')}</button>
      </div>`).join('');

    try {
      const map = await db.signedUrls(pages.map((p) => p.storage_path));
      zone.querySelectorAll('img[data-path]').forEach((img) => {
        const u = map.get(img.dataset.path);
        if (u) img.src = u;
      });
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  zone.addEventListener('click', async (e) => {
    const sup = e.target.closest('[data-page-del]');
    if (sup) {
      const ok = await confirmDialog({
        title: 'Supprimer cette page ?', message: 'Cette action est définitive.',
        confirmLabel: 'Supprimer', danger: true
      });
      if (!ok) return;
      try {
        const p = pages.find((x) => x.id === sup.dataset.pageDel);
        await db.deletePage(p);
        pages = pages.filter((x) => x.id !== p.id);
        await db.reorderPages(pages);
        dessinerPages();
        toast('Page supprimée');
      } catch (err) { toast(errMsg(err), 'err'); }
      return;
    }
    const carte = e.target.closest('[data-page]');
    if (carte) ouvrirVisionneuse(Number(carte.dataset.page));
  });

  /* --------------------------------------------------- « pas terminée »   */
  const banniere = root.querySelector('[data-unfinished-banner]');
  const boutonTodo = root.querySelector('[data-todo]');

  function dessinerTodo() {
    boutonTodo.innerHTML = feuille.unfinished
      ? `${icon('check')}<span>Terminée</span>`
      : `${icon('clock')}<span>À terminer</span>`;
    boutonTodo.classList.toggle('warn', !!feuille.unfinished);
    banniere.innerHTML = feuille.unfinished
      ? `<div class="banner" style="margin-bottom:16px">${icon('clock')}
           <div class="grow">Feuille <strong>pas terminée</strong> — il reste à la compléter.</div>
         </div>`
      : '';
  }

  boutonTodo.addEventListener('click', async () => {
    boutonTodo.disabled = true;
    try {
      const maj = await db.updateSheet(feuille.id, { unfinished: !feuille.unfinished });
      feuille.unfinished = maj.unfinished;
      dessinerTodo();
      toast(feuille.unfinished ? 'Marquée comme non terminée' : 'Marquée comme terminée');
    } catch (err) { toast(errMsg(err), 'err'); }
    boutonTodo.disabled = false;
  });

  dessinerTodo();

  /* ------------------------------------------------------- texte transcrit */
  const zoneTexte = root.querySelector('[data-texte]');

  function dessinerTexte() {
    if (!feuille.ocr_text) { zoneTexte.innerHTML = ''; return; }
    zoneTexte.innerHTML = `
      <details class="card pad" open>
        <summary style="cursor:pointer;font-weight:600;font-size:.92rem;
                 display:flex;align-items:center;gap:8px">
          ${icon('file')} Texte de la feuille
        </summary>
        <div style="white-space:pre-wrap;font-size:.92rem;line-height:1.65;
             color:var(--txt-2);margin-top:12px">${esc(feuille.ocr_text)}</div>
      </details>`;
  }

  root.querySelector('[data-ocr]').addEventListener('click', () => {
    openTranscription(feuille, {
      onSaved: (t) => { feuille.ocr_text = t; dessinerTexte(); }
    });
  });

  dessinerTexte();

  /* -------------------------------------------------------------- actions */
  root.querySelector('[data-star]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const maj = await db.updateSheet(feuille.id, { starred: !feuille.starred });
      feuille.starred = maj.starred;
      b.innerHTML = `${feuille.starred ? iconStarFilled() : icon('star')}
        <span>${feuille.starred ? 'Favori' : 'Marquer'}</span>`;
    } catch (err) { toast(errMsg(err), 'err'); }
    b.disabled = false;
  });

  root.querySelector('[data-file]').addEventListener('click', async () => {
    const meta = await openFiler({
      title: 'Ranger cette feuille',
      initial: {
        subject_id: feuille.subject_id, chapter_id: feuille.chapter_id,
        title: feuille.title, taken_on: feuille.taken_on,
        tags: feuille.tags, note: feuille.note, unfinished: feuille.unfinished
      }
    });
    if (!meta) return;
    try {
      await db.updateSheet(feuille.id, meta);
      toast('Rangement mis à jour');
      rerender();
    } catch (e) { toast(errMsg(e), 'err'); }
  });

  root.querySelector('[data-del]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Supprimer la feuille ?',
      message: `« ${feuille.title || 'Sans titre'} » et ses ${pages.length} page(s) seront `
             + `définitivement effacées.`,
      confirmLabel: 'Supprimer', danger: true
    });
    if (!ok) return;
    try {
      await db.deleteSheet(feuille.id);
      toast('Feuille supprimée');
      history.length > 1 ? history.back() : (location.hash = '#/');
    } catch (e) { toast(errMsg(e), 'err'); }
  });

  /* ------------------------------------------------------ ajout d'une page */
  const input = root.querySelector('[data-input]');
  root.querySelector('[data-add]').addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const fichiers = [...e.target.files].filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!fichiers.length) return;
    const barre = root.querySelector('[data-progress]');
    barre.classList.remove('hidden');
    try {
      for (let i = 0; i < fichiers.length; i++) {
        const src = await loadImage(fichiers[i]);
        const out = await process(src, { filter: 'document', maxSize: 2200, quality: 0.82 });
        const pos = pages.length;
        const path = await db.uploadImage(state.user.id, feuille.id, pos, out.blob);
        const row = await db.addPage({
          sheet_id: feuille.id, position: pos, storage_path: path,
          width: out.width, height: out.height, bytes: out.blob.size
        });
        URL.revokeObjectURL(out.url);
        pages.push(row);
        barre.querySelector('i').style.width = `${Math.round(((i + 1) / fichiers.length) * 100)}%`;
      }
      await dessinerPages();
      toast('Page ajoutée');
    } catch (err) { toast(errMsg(err), 'err'); }
    barre.classList.add('hidden');
    barre.querySelector('i').style.width = '0';
  });

  /* --------------------------------------------------------- visionneuse   */
  async function ouvrirVisionneuse(index = 0) {
    const vue = el(`
      <div class="viewer">
        <div class="v-head">
          <button class="icon-btn" data-close>${icon('x')}</button>
          <div class="t">${esc(feuille.title || 'Sans titre')}</div>
          <a class="icon-btn" data-dl target="_blank" rel="noopener">${icon('download')}</a>
        </div>
        <div class="v-stage"></div>
        <div class="v-foot" data-foot></div>
      </div>`);
    const scene = vue.querySelector('.v-stage');
    scene.innerHTML = pages.map((p) =>
      `<div class="v-page"><img data-path="${esc(p.storage_path)}" alt=""></div>`).join('');
    document.body.appendChild(vue);
    document.body.style.overflow = 'hidden';

    const map = await db.signedUrls(pages.map((p) => p.storage_path));
    vue.querySelectorAll('img[data-path]').forEach((img) => {
      const u = map.get(img.dataset.path);
      if (u) img.src = u;
    });

    const majPied = () => {
      const i = Math.round(scene.scrollLeft / Math.max(1, scene.clientWidth));
      vue.querySelector('[data-foot]').textContent = `Page ${i + 1} sur ${pages.length}`;
      const lien = vue.querySelector('[data-dl]');
      lien.href = map.get(pages[i]?.storage_path) || '#';
      lien.download = `${(feuille.title || 'feuille').replace(/[^\w\-]+/g, '_')}-${i + 1}.jpg`;
    };
    scene.addEventListener('scroll', majPied, { passive: true });
    scene.scrollLeft = index * scene.clientWidth;
    majPied();

    const fermer = () => {
      vue.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', touche);
    };
    const touche = (e) => {
      if (e.key === 'Escape') fermer();
      if (e.key === 'ArrowRight') scene.scrollBy({ left: scene.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') scene.scrollBy({ left: -scene.clientWidth, behavior: 'smooth' });
    };
    vue.querySelector('[data-close]').addEventListener('click', fermer);
    document.addEventListener('keydown', touche);
  }

  dessinerPages();
  return root;
}
