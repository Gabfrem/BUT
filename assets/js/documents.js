/* Documents de cours : polycopiés, sujets de TD, corrigés — récupérés sur
 * Moodle et rattachés au même chapitre que les notes manuscrites. */

import { icon } from './icons.js';
import { el, esc, openModal, toast, errMsg, fmtBytes, dateShort,
         confirmDialog, promptDialog } from './ui.js';
import * as db from './db.js';
import { state, chaptersFor, invalidateChapters } from './state.js';

export const TYPES = [
  { id: 'cours',   label: 'Cours' },
  { id: 'td',      label: 'TD' },
  { id: 'tp',      label: 'TP' },
  { id: 'sujet',   label: 'Sujet' },
  { id: 'corrige', label: 'Corrigé' },
  { id: 'autre',   label: 'Autre' }
];

const libelleType = (id) => TYPES.find((t) => t.id === id)?.label || 'Document';

/** Pictogramme et couleur selon le type de fichier. */
function pictogramme(mime = '') {
  if (String(mime).startsWith('image/')) return { ico: 'image', couleur: '#0f8a6d' };
  if (mime === 'application/pdf') return { ico: 'file', couleur: '#c2410c' };
  if (String(mime).includes('zip')) return { ico: 'layers', couleur: '#7c3aed' };
  return { ico: 'file', couleur: '#5b5bd6' };
}

/** Ligne d'un document dans une liste. */
export function documentRowHtml(d) {
  const p = pictogramme(d.mime);
  const bits = [libelleType(d.kind), d.chapter_name, fmtBytes(d.bytes), dateShort(d.created_at)]
    .filter(Boolean).join(' · ');
  return `
    <div class="row-item" data-doc="${esc(d.id)}">
      <span class="swatch" style="background:${p.couleur}1f;color:${p.couleur}">${icon(p.ico)}</span>
      <span class="grow">
        <span class="ttl">${esc(d.title)}</span>
        <span class="sub">${esc(bits)}</span>
      </span>
      <button class="icon-btn" data-doc-edit="${esc(d.id)}" title="Modifier">${icon('pencil')}</button>
      <span class="chev">${icon('external')}</span>
    </div>`;
}

/** Ouvre le fichier dans un nouvel onglet (URL signée, valable une heure). */
export async function ouvrirDocument(d) {
  // La fenêtre est ouverte AVANT l'await : sinon les bloqueurs de pop-up
  // considèrent l'ouverture comme non sollicitée par l'utilisateur.
  const onglet = window.open('', '_blank');
  try {
    const url = await db.signedUrl(d.storage_path);
    if (onglet) onglet.location = url;
    else window.location = url;
  } catch (e) {
    onglet?.close();
    toast(errMsg(e), 'err');
  }
}

/* ------------------------------------------------------------- FORMULAIRE */

/** Champs partagés entre l'ajout et la modification d'un document. */
function champsCommuns({ titre = '', kind = 'cours', note = '', subjectId, chapterId }) {
  const body = el(`
    <div>
      <div class="field">
        <label>Titre</label>
        <input class="input" data-titre value="${esc(titre)}"
               placeholder="ex. Chapitre 2 — Les jointures (poly)">
      </div>
      <div class="field">
        <label>Type</label>
        <div class="pick" data-types></div>
      </div>
      <div class="field">
        <label>Matière</label>
        <div class="pick" data-subjects></div>
      </div>
      <div class="field" data-chapter-field>
        <label>Chapitre</label>
        <div class="pick" data-chapters></div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Note <span style="font-weight:400;color:var(--txt-3)">(optionnel)</span></label>
        <textarea class="textarea" data-note
          placeholder="à quoi sert ce document…">${esc(note)}</textarea>
      </div>
    </div>`);

  let typeSel = kind;
  let sujetSel = subjectId || null;
  let chapSel = chapterId || null;

  const zoneTypes = body.querySelector('[data-types]');
  const zoneSujets = body.querySelector('[data-subjects]');
  const zoneChaps = body.querySelector('[data-chapters]');
  const champChap = body.querySelector('[data-chapter-field]');

  const dessinerTypes = () => {
    zoneTypes.innerHTML = TYPES.map((t) =>
      `<button type="button" data-t="${t.id}" class="${t.id === typeSel ? 'on' : ''}">${esc(t.label)}</button>`
    ).join('');
  };

  const dessinerSujets = () => {
    zoneSujets.innerHTML = state.subjects.map((s) => `
      <button type="button" data-s="${esc(s.id)}" class="${s.id === sujetSel ? 'on' : ''}">
        <span class="dot" style="background:${esc(s.color)}"></span>${esc(s.code || s.name)}
      </button>`).join('');
  };

  const dessinerChapitres = async () => {
    if (!sujetSel) { champChap.classList.add('hidden'); return; }
    champChap.classList.remove('hidden');
    let liste = [];
    try { liste = await chaptersFor(sujetSel); } catch { /* ignore */ }
    zoneChaps.innerHTML =
      `<button type="button" data-c="" class="${!chapSel ? 'on' : ''}">Sans chapitre</button>` +
      liste.map((c) => `<button type="button" data-c="${esc(c.id)}"
        class="${c.id === chapSel ? 'on' : ''}">${esc(c.name)}</button>`).join('') +
      `<button type="button" class="add" data-nouveau>${icon('plus')} Nouveau</button>`;
  };

  zoneTypes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    typeSel = b.dataset.t;
    dessinerTypes();
  });

  zoneSujets.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    sujetSel = b.dataset.s === sujetSel ? null : b.dataset.s;
    chapSel = null;
    dessinerSujets();
    dessinerChapitres();
  });

  zoneChaps.addEventListener('click', async (e) => {
    if (e.target.closest('[data-nouveau]')) {
      const nom = await promptDialog({
        title: 'Nouveau chapitre', label: 'Nom du chapitre',
        placeholder: 'ex. Chapitre 3 — Les jointures', confirmLabel: 'Créer'
      });
      if (!nom) return;
      try {
        const liste = await chaptersFor(sujetSel);
        const c = await db.createChapter(sujetSel, nom, liste.length);
        invalidateChapters(sujetSel);
        chapSel = c.id;
        await dessinerChapitres();
        toast('Chapitre créé');
      } catch (err) { toast(errMsg(err), 'err'); }
      return;
    }
    const b = e.target.closest('[data-c]');
    if (!b) return;
    chapSel = b.dataset.c || null;
    dessinerChapitres();
  });

  dessinerTypes();
  dessinerSujets();
  dessinerChapitres();

  return {
    body,
    valeurs: () => ({
      title: body.querySelector('[data-titre]').value.trim(),
      kind: typeSel,
      subject_id: sujetSel,
      chapter_id: chapSel,
      note: body.querySelector('[data-note]').value.trim() || null
    })
  };
}

/* ---------------------------------------------------------- TÉLÉVERSEMENT */

/**
 * Choisit un ou plusieurs fichiers, demande leur classement, les envoie.
 * @param {{subjectId?, chapterId?, onDone?:Function}} opts
 */
export function openDocumentUploader({ subjectId = null, chapterId = null, onDone } = {}) {
  const input = el('<input type="file" class="sr-only" multiple>');
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const fichiers = [...input.files];
    input.remove();
    if (!fichiers.length) return;
    // Un formulaire à la fois : chaque document a son propre classement.
    for (const f of fichiers) await formulaireAjout(f, { subjectId, chapterId, onDone });
  });
  input.click();
}

function formulaireAjout(fichier, { subjectId, chapterId, onDone }) {
  return new Promise((resolve) => {
    const titreAuto = fichier.name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const f = champsCommuns({ titre: titreAuto, subjectId, chapterId });

    f.body.insertBefore(el(`
      <div class="banner info" style="margin-bottom:14px">${icon('file')}
        <div class="grow"><strong>${esc(fichier.name)}</strong><br>
          <span style="opacity:.8">${esc(fmtBytes(fichier.size))}</span></div>
      </div>`), f.body.firstChild);

    const progression = el('<div class="progress hidden" style="margin-top:14px"><i></i></div>');
    f.body.appendChild(progression);

    openModal({
      title: 'Ajouter un document',
      body: f.body,
      onClose: () => resolve(),
      actions: [
        { label: 'Annuler', onClick: ({ close }) => close() },
        {
          label: 'Ajouter', kind: 'primary', icon: 'check',
          onClick: async ({ close, button }) => {
            const v = f.valeurs();
            if (!v.title) { f.body.querySelector('[data-titre]').focus(); return; }
            button.disabled = true;
            progression.classList.remove('hidden');
            progression.querySelector('i').style.width = '40%';
            try {
              const path = await db.uploadDocument(state.user.id, fichier);
              progression.querySelector('i').style.width = '85%';
              const doc = await db.createDocument({
                ...v,
                storage_path: path,
                mime: fichier.type || null,
                bytes: fichier.size
              });
              toast('Document ajouté');
              onDone?.(doc);
              close();
            } catch (e) {
              button.disabled = false;
              progression.classList.add('hidden');
              toast(errMsg(e), 'err', 5000);
            }
          }
        }
      ]
    });
  });
}

/* ---------------------------------------------------------------- ÉDITION */

export function openDocumentEditor(doc, { onDone } = {}) {
  const f = champsCommuns({
    titre: doc.title, kind: doc.kind, note: doc.note || '',
    subjectId: doc.subject_id, chapterId: doc.chapter_id
  });

  openModal({
    title: 'Modifier le document',
    body: f.body,
    actions: [
      {
        label: 'Supprimer', kind: 'danger',
        onClick: async ({ close }) => {
          const ok = await confirmDialog({
            title: 'Supprimer ce document ?',
            message: `« ${doc.title} » et son fichier seront définitivement effacés.`,
            confirmLabel: 'Supprimer', danger: true
          });
          if (!ok) return;
          try {
            await db.deleteDocument(doc);
            toast('Document supprimé');
            onDone?.(null);
            close();
          } catch (e) { toast(errMsg(e), 'err'); }
        }
      },
      {
        label: 'Enregistrer', kind: 'primary', icon: 'check',
        onClick: async ({ close, button }) => {
          const v = f.valeurs();
          if (!v.title) return;
          button.disabled = true;
          try {
            const maj = await db.updateDocument(doc.id, v);
            toast('Document modifié');
            onDone?.(maj);
            close();
          } catch (e) { button.disabled = false; toast(errMsg(e), 'err'); }
        }
      }
    ]
  });
}
