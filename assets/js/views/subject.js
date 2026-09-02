/* Fiche d'une matière : ses chapitres, et pour le chapitre choisi les trois
 * matières premières du suivi — le cours (documents), les notes scannées et
 * le code. */

import { icon } from '../icons.js';
import { el, esc, toast, errMsg, colorFor, subjectBadge, confirmDialog, promptDialog,
         openModal, rerender } from '../ui.js';
import * as db from '../db.js';
import { chaptersFor, invalidateChapters, refreshSubjects, subjectById } from '../state.js';
import { sheetGrid, emptyState, openSubjectEditor } from '../components.js';
import { documentRowHtml, ouvrirDocument, openDocumentUploader, openDocumentEditor } from '../documents.js';
import { snippetRowHtml, openSnippetViewer, openSnippetEditor } from '../snippets.js';

export async function render(params) {
  const id = params.id;
  let sujet = subjectById(id);
  if (!sujet) {
    await refreshSubjects();
    sujet = subjectById(id);
  }
  if (!sujet) {
    return el(`<div class="empty"><div class="ico">${icon('alert')}</div>
      <h3>Matière introuvable</h3><p>Elle a peut-être été supprimée.</p></div>`);
  }

  let filtreChapitre = params.chapitre || 'tout';   // 'tout' | 'sans' | id
  const couleur = sujet.color || colorFor(sujet.name);

  const root = el(`
    <div>
      <div style="display:flex;gap:13px;align-items:flex-start;margin-bottom:18px">
        <span class="swatch" style="background:${esc(couleur)};width:46px;height:46px;border-radius:14px">
          ${esc(subjectBadge(sujet))}
        </span>
        <div style="flex:1;min-width:0">
          <h1 style="font-size:1.3rem">${esc(sujet.name)}</h1>
          <div class="sub" style="color:var(--txt-3);font-size:.84rem;margin-top:2px">
            ${esc([sujet.code, sujet.semester, sujet.kind === 'sae' ? 'SAÉ' : null]
                  .filter(Boolean).join(' · '))}
          </div>
        </div>
        <button class="icon-btn" data-edit title="Modifier">${icon('pencil')}</button>
        <button class="icon-btn" data-del title="Supprimer">${icon('trash')}</button>
      </div>

      <div class="filters" data-chapters style="margin-bottom:18px"></div>

      <div class="mat-section">
        <div class="section-head">
          <h2>Cours</h2>
          <button class="btn sm" data-add-doc>${icon('upload')}<span>Ajouter</span></button>
        </div>
        <div data-docs></div>
      </div>

      <div class="mat-section">
        <div class="section-head">
          <h2>Mes feuilles</h2>
          <button class="btn sm" data-add-sheet>${icon('camera')}<span>Scanner</span></button>
        </div>
        <div data-grid></div>
      </div>

      <div class="mat-section">
        <div class="section-head">
          <h2>Code</h2>
          <button class="btn sm" data-add-code>${icon('plus')}<span>Nouveau</span></button>
        </div>
        <div data-code></div>
      </div>
    </div>`);

  /* -------------------------------------------------------- édition matière */
  root.querySelector('[data-edit]').addEventListener('click', async () => {
    const maj = await openSubjectEditor(sujet);
    if (maj) rerender();
  });

  root.querySelector('[data-del]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Supprimer la matière ?',
      message: `« ${sujet.name} » et ses chapitres seront supprimés. Les feuilles, documents `
             + `et codes sont conservés, mais perdront leur rattachement.`,
      confirmLabel: 'Supprimer', danger: true
    });
    if (!ok) return;
    try {
      await db.deleteSubject(sujet.id);
      await refreshSubjects();
      toast('Matière supprimée');
      location.hash = '#/matieres';
    } catch (e) { toast(errMsg(e), 'err'); }
  });

  /* ------------------------------------------------------------ chapitres */
  const barre = root.querySelector('[data-chapters]');
  let chapitres = [];

  async function drawChapters() {
    chapitres = await chaptersFor(sujet.id, { force: true });
    barre.innerHTML =
      `<button data-c="tout" class="${filtreChapitre === 'tout' ? 'on' : ''}">Tout</button>` +
      chapitres.map((c) => `<button data-c="${esc(c.id)}"
        class="${filtreChapitre === c.id ? 'on' : ''}">${esc(c.name)}</button>`).join('') +
      `<button data-c="sans" class="${filtreChapitre === 'sans' ? 'on' : ''}">Hors chapitre</button>` +
      `<button data-new-chapter title="Nouveau chapitre">${icon('plus')}</button>` +
      (chapitres.length ? `<button data-manage title="Gérer les chapitres">${icon('settings')}</button>` : '');
  }

  barre.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new-chapter]')) {
      const nom = await promptDialog({
        title: 'Nouveau chapitre', label: 'Nom du chapitre',
        placeholder: 'ex. Chapitre 3 — Les jointures', confirmLabel: 'Créer'
      });
      if (!nom) return;
      try {
        await db.createChapter(sujet.id, nom, chapitres.length);
        invalidateChapters(sujet.id);
        await drawChapters();
        toast('Chapitre créé');
      } catch (err) { toast(errMsg(err), 'err'); }
      return;
    }
    if (e.target.closest('[data-manage]')) { gererChapitres(); return; }
    const b = e.target.closest('[data-c]');
    if (!b) return;
    filtreChapitre = b.dataset.c;
    drawChapters();
    chargerTout();
  });

  /* ----------------------------------------------- gestion des chapitres  */
  function gererChapitres() {
    const body = el('<div class="list"></div>');
    const dessine = () => {
      body.innerHTML = chapitres.map((c) => `
        <div class="row-item" data-id="${esc(c.id)}" style="cursor:default">
          <span class="grow">
            <span class="ttl">${esc(c.name)}</span>
            <span class="sub">${c.sheet_count || 0} feuille${(c.sheet_count || 0) > 1 ? 's' : ''}</span>
          </span>
          <button class="icon-btn" data-ren>${icon('pencil')}</button>
          <button class="icon-btn" data-sup>${icon('trash')}</button>
        </div>`).join('') || '<p class="hint">Aucun chapitre pour l’instant.</p>';
    };
    body.addEventListener('click', async (e) => {
      const ligne = e.target.closest('[data-id]');
      if (!ligne) return;
      const c = chapitres.find((x) => x.id === ligne.dataset.id);
      if (e.target.closest('[data-ren]')) {
        const nom = await promptDialog({
          title: 'Renommer le chapitre', label: 'Nom', value: c.name, confirmLabel: 'Renommer'
        });
        if (!nom) return;
        try {
          await db.updateChapter(c.id, { name: nom });
          invalidateChapters(sujet.id);
          await drawChapters();
          dessine();
          toast('Chapitre renommé');
        } catch (err) { toast(errMsg(err), 'err'); }
      } else if (e.target.closest('[data-sup]')) {
        const ok = await confirmDialog({
          title: 'Supprimer le chapitre ?',
          message: `Le contenu de « ${c.name} » reste dans la matière, mais sans chapitre.`,
          confirmLabel: 'Supprimer', danger: true
        });
        if (!ok) return;
        try {
          await db.deleteChapter(c.id);
          invalidateChapters(sujet.id);
          if (filtreChapitre === c.id) filtreChapitre = 'tout';
          await drawChapters();
          dessine();
          chargerTout();
          toast('Chapitre supprimé');
        } catch (err) { toast(errMsg(err), 'err'); }
      }
    });
    dessine();
    openModal({ title: 'Chapitres', body, actions: [{ label: 'Fermer', onClick: ({ close }) => close() }] });
  }

  /* --------------------------------------------- filtre commun aux sections */
  function filtre() {
    const f = { subjectId: sujet.id };
    if (filtreChapitre === 'sans') f.noChapter = true;
    else if (filtreChapitre !== 'tout') f.chapterId = filtreChapitre;
    return f;
  }
  const chapitreCourant = () => (filtreChapitre === 'tout' || filtreChapitre === 'sans'
    ? null : filtreChapitre);

  /* ------------------------------------------------------- 1. LES COURS   */
  const zoneDocs = root.querySelector('[data-docs]');
  let documents = [];

  root.querySelector('[data-add-doc]').addEventListener('click', () => {
    openDocumentUploader({
      subjectId: sujet.id, chapterId: chapitreCourant(), onDone: () => chargerDocs()
    });
  });

  zoneDocs.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-doc-edit]');
    if (edit) {
      e.stopPropagation();
      const d = documents.find((x) => x.id === edit.dataset.docEdit);
      if (d) openDocumentEditor(d, { onDone: () => chargerDocs() });
      return;
    }
    const ligne = e.target.closest('[data-doc]');
    if (!ligne) return;
    const d = documents.find((x) => x.id === ligne.dataset.doc);
    if (d) ouvrirDocument(d);
  });

  async function chargerDocs() {
    zoneDocs.innerHTML = '<div class="skeleton" style="height:64px"></div>';
    try {
      documents = await db.listDocuments(filtre());
      zoneDocs.innerHTML = documents.length
        ? `<div class="list">${documents.map(documentRowHtml).join('')}</div>`
        : '';
      if (!documents.length) {
        zoneDocs.appendChild(emptyState({
          ico: 'file',
          title: 'Aucun document',
          text: 'Dépose ici les polycopiés, sujets de TD et corrigés récupérés sur Moodle.',
          action: {
            label: 'Ajouter un document', icon: 'upload',
            onClick: () => openDocumentUploader({
              subjectId: sujet.id, chapterId: chapitreCourant(), onDone: () => chargerDocs()
            })
          }
        }));
      }
    } catch (e) {
      zoneDocs.innerHTML = `<div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div>`;
    }
  }

  /* ---------------------------------------------------- 2. LES FEUILLES   */
  const grid = root.querySelector('[data-grid]');

  root.querySelector('[data-add-sheet]').addEventListener('click', () => {
    location.hash = `#/scan?matiere=${sujet.id}`;
  });

  async function chargerFeuilles() {
    grid.innerHTML = `<div class="sheet-grid">${'<div class="skeleton" style="height:212px"></div>'.repeat(3)}</div>`;
    try {
      const feuilles = await db.listSheets(filtre());
      grid.innerHTML = '';
      if (!feuilles.length) {
        grid.appendChild(emptyState({
          ico: 'camera',
          title: 'Aucune feuille',
          text: filtreChapitre === 'tout'
            ? 'Scanne tes notes : elles se rangeront ici.'
            : 'Aucune feuille dans cette sélection.',
          action: {
            label: 'Scanner', icon: 'camera',
            onClick: () => { location.hash = `#/scan?matiere=${sujet.id}`; }
          }
        }));
      } else {
        grid.appendChild(sheetGrid(feuilles));
      }
    } catch (e) {
      grid.innerHTML = `<div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div>`;
    }
  }

  /* -------------------------------------------------------- 3. LE CODE    */
  const zoneCode = root.querySelector('[data-code]');
  let codes = [];

  root.querySelector('[data-add-code]').addEventListener('click', () => {
    openSnippetEditor(null, {
      subjectId: sujet.id, chapterId: chapitreCourant(), onDone: () => chargerCode()
    });
  });

  zoneCode.addEventListener('click', (e) => {
    const ligne = e.target.closest('[data-snippet]');
    if (!ligne) return;
    const s = codes.find((x) => x.id === ligne.dataset.snippet);
    if (s) openSnippetViewer(s, { onChange: () => chargerCode() });
  });

  async function chargerCode() {
    zoneCode.innerHTML = '<div class="skeleton" style="height:64px"></div>';
    try {
      codes = await db.listSnippets(filtre());
      zoneCode.innerHTML = codes.length
        ? `<div class="list">${codes.map(snippetRowHtml).join('')}</div>`
        : '';
      if (!codes.length) {
        zoneCode.appendChild(emptyState({
          ico: 'code',
          title: 'Aucun code',
          text: 'Garde ici les bouts de code écrits en TP, rattachés à leur chapitre.',
          action: {
            label: 'Écrire du code', icon: 'plus',
            onClick: () => openSnippetEditor(null, {
              subjectId: sujet.id, chapterId: chapitreCourant(), onDone: () => chargerCode()
            })
          }
        }));
      }
    } catch (e) {
      zoneCode.innerHTML = `<div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div>`;
    }
  }

  function chargerTout() {
    chargerDocs();
    chargerFeuilles();
    chargerCode();
  }

  await drawChapters();
  chargerTout();
  return root;
}
