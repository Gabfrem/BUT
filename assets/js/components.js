/* Composants réutilisés par plusieurs pages : grille de feuilles, sélecteur
 * de rangement (matière + chapitre), édition d'une matière. */

import { icon, iconStarFilled } from './icons.js';
import {
  el, esc, openModal, toast, errMsg, dateShort, dateRelative,
  colorFor, subjectBadge, PALETTE, toDay
} from './ui.js';
import * as db from './db.js';
import { state, chaptersFor, refreshSubjects, invalidateChapters } from './state.js';

/* ------------------------------------------------------ GRILLE DE FEUILLES */

export function sheetCardHtml(s) {
  const color = s.subject_color || colorFor(s.subject_name || 'x');
  const sub = [s.subject_code || s.subject_name, s.chapter_name].filter(Boolean).join(' · ');
  return `
    <button class="sheet-card" data-sheet="${esc(s.id)}">
      <div class="thumb" data-path="${esc(s.cover_path || '')}">
        <span class="ph">${icon('image')}</span>
        ${s.page_count > 1 ? `<span class="badge">${s.page_count} p.</span>` : ''}
        ${s.starred ? `<span class="star">${iconStarFilled()}</span>` : ''}
        ${s.unfinished ? '<span class="todo">à terminer</span>' : ''}
        <span class="ocr-btn" data-ocr="${esc(s.id)}" role="button" tabindex="0"
              title="${s.ocr_text ? 'Lire le texte' : 'Transcrire en texte'}">
          ${icon('file')}<span>${s.ocr_text ? 'Texte' : 'Transcrire'}</span>
        </span>
      </div>
      <div class="meta">
        <div class="bar" style="background:${esc(color)}"></div>
        <div class="ttl">${esc(s.title || 'Sans titre')}</div>
        <div class="sub">${esc(sub || 'À ranger')} · ${esc(dateShort(s.taken_on))}</div>
      </div>
    </button>`;
}

/** Remplit les vignettes d'un conteneur avec des URLs signées (1 seul appel). */
export async function hydrateThumbs(root) {
  const holders = [...root.querySelectorAll('.thumb[data-path]')].filter((h) => h.dataset.path);
  if (!holders.length) return;
  try {
    const map = await db.signedUrls(holders.map((h) => h.dataset.path));
    holders.forEach((h) => {
      const url = map.get(h.dataset.path);
      if (!url) return;
      const img = new Image();
      img.loading = 'lazy';
      img.alt = '';
      img.src = url;
      img.onload = () => h.querySelector('.ph')?.remove();
      h.prepend(img);
    });
  } catch (e) {
    console.warn('Vignettes indisponibles :', e.message);
  }
}

/**
 * Grille de feuilles cliquables.
 * @param {Array} sheets
 * @param {{horizontal?:boolean, onOpen?:Function}} opts
 */
export function sheetGrid(sheets, { horizontal = false, onOpen } = {}) {
  const wrap = el(`<div class="${horizontal ? 'hscroll' : 'sheet-grid'}"></div>`);
  wrap.innerHTML = sheets.map(sheetCardHtml).join('');
  wrap.addEventListener('click', async (e) => {
    // Le bouton « texte » ne doit pas ouvrir la feuille derrière lui.
    const ocr = e.target.closest('[data-ocr]');
    if (ocr) {
      e.preventDefault();
      e.stopPropagation();
      const feuille = sheets.find((s) => s.id === ocr.dataset.ocr);
      if (!feuille) return;
      const { openTranscription } = await import('./transcription.js');
      openTranscription(feuille, {
        onSaved: (t) => {
          feuille.ocr_text = t;
          ocr.querySelector('span').textContent = t ? 'Texte' : 'Transcrire';
        }
      });
      return;
    }
    const card = e.target.closest('[data-sheet]');
    if (!card) return;
    if (onOpen) onOpen(card.dataset.sheet);
    else location.hash = `#/feuille/${card.dataset.sheet}`;
  });
  hydrateThumbs(wrap);
  return wrap;
}

/* ------------------------------------------------------------- ÉTAT VIDE  */

export function emptyState({ ico = 'inbox', title, text, action }) {
  const node = el(`
    <div class="empty">
      <div class="ico">${icon(ico)}</div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
    </div>`);
  if (action) {
    const b = el(`<button class="btn primary">${icon(action.icon || 'plus')}<span>${esc(action.label)}</span></button>`);
    b.addEventListener('click', action.onClick);
    node.appendChild(b);
  }
  return node;
}

/* ----------------------------------------------------- CHAMP DE MOTS-CLÉS */

function tagField(initial = []) {
  const tags = [...initial];
  const box = el(`<div class="tag-input"><input placeholder="ajouter un mot-clé…"></div>`);
  const input = box.querySelector('input');

  const draw = () => {
    box.querySelectorAll('.chip').forEach((c) => c.remove());
    tags.forEach((t, i) => {
      const chip = el(`<span class="chip">${esc(t)}<button type="button" aria-label="Retirer">×</button></span>`);
      chip.querySelector('button').addEventListener('click', () => { tags.splice(i, 1); draw(); });
      box.insertBefore(chip, input);
    });
  };
  const add = () => {
    const v = input.value.trim().replace(/,$/, '');
    if (v && !tags.includes(v)) tags.push(v);
    input.value = '';
    draw();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); }
  });
  input.addEventListener('blur', add);
  draw();
  return { box, get: () => [...tags] };
}

/* -------------------------------------------- MODALE « RANGER LA FEUILLE » */

/**
 * Demande dans quelle matière / quel chapitre ranger une feuille.
 * @param {{initial?:object, title?:string, confirmLabel?:string, suggestion?:object}} opts
 * @returns {Promise<object|null>} { subject_id, chapter_id, title, taken_on, tags, note }
 */
export function openFiler({
  initial = {}, title = 'Ranger cette feuille',
  confirmLabel = 'Enregistrer', suggestion = null
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    let subjectId = initial.subject_id ?? suggestion?.id ?? null;
    let chapterId = initial.chapter_id ?? null;

    const body = el(`
      <div>
        <div class="field">
          <label>Matière</label>
          <div class="pick" data-subjects></div>
        </div>
        <div class="field" data-chapter-field>
          <label>Chapitre</label>
          <div class="pick" data-chapters></div>
        </div>
        <div class="field">
          <label>Titre de la feuille</label>
          <input class="input" data-title value="${esc(initial.title || '')}"
                 placeholder="ex. Jointures SQL, exercices 3 à 7">
        </div>
        <div class="row">
          <div class="field">
            <label>Date du cours</label>
            <input class="input" type="date" data-date value="${esc(initial.taken_on || toDay())}">
          </div>
        </div>
        <div class="field">
          <label>Mots-clés <span style="font-weight:400;color:var(--txt-3)">(optionnel)</span></label>
          <div data-tags></div>
        </div>
        <label class="check-line">
          <input type="checkbox" data-unfinished ${initial.unfinished ? 'checked' : ''}>
          <span><strong>Feuille pas terminée</strong>
            <span style="color:var(--txt-3)">— à compléter ou à recopier plus tard.</span></span>
        </label>
        <div class="field" style="margin-bottom:0">
          <label>Note <span style="font-weight:400;color:var(--txt-3)">(optionnel)</span></label>
          <textarea class="textarea" data-note
            placeholder="ce qu'il y a sur la feuille, ce qu'il reste à faire…">${esc(initial.note || '')}</textarea>
        </div>
      </div>`);

    const subjWrap = body.querySelector('[data-subjects]');
    const chapWrap = body.querySelector('[data-chapters]');
    const chapField = body.querySelector('[data-chapter-field]');
    const titleInput = body.querySelector('[data-title]');
    const tags = tagField(initial.tags || []);
    body.querySelector('[data-tags]').appendChild(tags.box);

    /* --- matières --- */
    function drawSubjects() {
      const list = [...state.subjects];
      if (suggestion) {   // le cours en cours d'après l'emploi du temps passe devant
        const i = list.findIndex((s) => s.id === suggestion.id);
        if (i > 0) list.unshift(list.splice(i, 1)[0]);
      }
      subjWrap.innerHTML = list.map((s) => `
        <button type="button" data-id="${esc(s.id)}" class="${s.id === subjectId ? 'on' : ''}">
          <span class="dot" style="background:${esc(s.color || colorFor(s.name))}"></span>
          <span>${esc(s.code || s.name)}</span>
          ${suggestion && s.id === suggestion.id ? '<span style="opacity:.7">· en cours</span>' : ''}
        </button>`).join('')
        + `<button type="button" class="add" data-new-subject>${icon('plus')} Nouvelle matière</button>`;
    }

    async function drawChapters() {
      if (!subjectId) {
        chapField.classList.add('hidden');
        return;
      }
      chapField.classList.remove('hidden');
      chapWrap.innerHTML = '<span class="chip">chargement…</span>';
      let list = [];
      try { list = await chaptersFor(subjectId); } catch (e) { toast(errMsg(e), 'err'); }
      chapWrap.innerHTML =
        `<button type="button" data-ch="" class="${!chapterId ? 'on' : ''}">Sans chapitre</button>` +
        list.map((c) => `<button type="button" data-ch="${esc(c.id)}"
             class="${c.id === chapterId ? 'on' : ''}">${esc(c.name)}</button>`).join('') +
        `<button type="button" class="add" data-new-chapter>${icon('plus')} Nouveau chapitre</button>`;
    }

    subjWrap.addEventListener('click', async (e) => {
      const nouveau = e.target.closest('[data-new-subject]');
      if (nouveau) {
        const s = await openSubjectEditor();
        if (s) { subjectId = s.id; chapterId = null; drawSubjects(); drawChapters(); }
        return;
      }
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      subjectId = btn.dataset.id === subjectId ? null : btn.dataset.id;
      chapterId = null;
      drawSubjects();
      drawChapters();
    });

    chapWrap.addEventListener('click', async (e) => {
      if (e.target.closest('[data-new-chapter]')) {
        const nom = await promptChapter();
        if (!nom) return;
        try {
          const list = await chaptersFor(subjectId);
          const c = await db.createChapter(subjectId, nom, list.length);
          invalidateChapters(subjectId);
          chapterId = c.id;
          await drawChapters();
          toast(`Chapitre « ${c.name} » créé`);
        } catch (err) { toast(errMsg(err), 'err'); }
        return;
      }
      const btn = e.target.closest('[data-ch]');
      if (!btn) return;
      chapterId = btn.dataset.ch || null;
      drawChapters();
    });

    drawSubjects();
    drawChapters();

    const modal = openModal({
      title,
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Annuler', onClick: ({ close }) => { done = true; resolve(null); close(); } },
        {
          label: confirmLabel, kind: 'primary', icon: 'check',
          onClick: ({ close }) => {
            done = true;
            resolve({
              subject_id: subjectId,
              chapter_id: chapterId,
              title: titleInput.value.trim() || null,
              taken_on: body.querySelector('[data-date]').value || toDay(),
              tags: tags.get(),
              note: body.querySelector('[data-note]').value.trim() || null,
              unfinished: body.querySelector('[data-unfinished]').checked
            });
            close();
          }
        }
      ]
    });
    return modal;
  });
}

function promptChapter() {
  return new Promise((resolve) => {
    let done = false;
    const body = el(`
      <div class="field" style="margin:0">
        <label>Nom du chapitre</label>
        <input class="input" placeholder="ex. Chapitre 2 — Les jointures">
        <p class="hint">Un chapitre regroupe les feuilles d'une même partie du cours.</p>
      </div>`);
    const input = body.querySelector('input');
    const ok = (close) => {
      const v = input.value.trim();
      if (!v) return input.focus();
      done = true; resolve(v); close();
    };
    const m = openModal({
      title: 'Nouveau chapitre', body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Annuler', onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: 'Créer', kind: 'primary', onClick: ({ close }) => ok(close) }
      ]
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(m.close); });
    setTimeout(() => input.focus(), 80);
  });
}

/* ------------------------------------------------- MODALE MATIÈRE (CRUD)  */

/**
 * Création / modification d'une matière.
 * @param {object|null} subject  null => création
 * @returns {Promise<object|null>} la matière enregistrée
 */
export function openSubjectEditor(subject = null) {
  return new Promise((resolve) => {
    let done = false;
    let color = subject?.color || PALETTE[state.subjects.length % PALETTE.length];

    const body = el(`
      <div>
        <div class="row">
          <div class="field" style="flex:0 0 40%">
            <label>Code</label>
            <input class="input" data-code value="${esc(subject?.code || '')}" placeholder="R1.04">
          </div>
          <div class="field">
            <label>Semestre</label>
            <select class="select" data-sem>
              <option value="">—</option>
              ${['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((s) =>
                `<option ${subject?.semester === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Nom de la matière</label>
          <input class="input" data-name value="${esc(subject?.name || '')}"
                 placeholder="Introduction aux bases de données">
        </div>
        <div class="field">
          <label>Type</label>
          <select class="select" data-kind>
            <option value="ressource" ${subject?.kind === 'ressource' ? 'selected' : ''}>Ressource</option>
            <option value="sae" ${subject?.kind === 'sae' ? 'selected' : ''}>SAÉ</option>
            <option value="autre" ${subject?.kind === 'autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Couleur</label>
          <div class="pick" data-colors></div>
        </div>
      </div>`);

    const colors = body.querySelector('[data-colors]');
    const drawColors = () => {
      colors.innerHTML = PALETTE.map((c) => `
        <button type="button" data-c="${c}" style="padding:6px 9px" class="${c === color ? 'on' : ''}">
          <span class="dot" style="background:${c}"></span>
        </button>`).join('');
    };
    colors.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      color = b.dataset.c;
      drawColors();
    });
    drawColors();

    const save = async ({ close, button }) => {
      const name = body.querySelector('[data-name]').value.trim();
      const code = body.querySelector('[data-code]').value.trim();
      if (!name && !code) { body.querySelector('[data-name]').focus(); return; }
      button.disabled = true;
      const payload = {
        name: name || code,
        code: code || null,
        color,
        semester: body.querySelector('[data-sem]').value || null,
        kind: body.querySelector('[data-kind]').value
      };
      try {
        const row = subject
          ? await db.updateSubject(subject.id, payload)
          : await db.createSubject({ ...payload, position: state.subjects.length });
        await refreshSubjects();
        done = true;
        resolve(row);
        close();
        toast(subject ? 'Matière modifiée' : `Matière « ${row.code || row.name} » créée`);
      } catch (e) {
        button.disabled = false;
        toast(errMsg(e), 'err');
      }
    };

    openModal({
      title: subject ? 'Modifier la matière' : 'Nouvelle matière',
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Annuler', onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: 'Enregistrer', kind: 'primary', onClick: save }
      ]
    });
  });
}

/* ------------------------------------------------------------- DIVERS     */

/** Ligne « matière » réutilisable (page Matières, accueil). */
export function subjectRowHtml(s) {
  const c = s.color || colorFor(s.name);
  const bits = [];
  if (s.chapter_count) bits.push(`${s.chapter_count} chapitre${s.chapter_count > 1 ? 's' : ''}`);
  bits.push(`${s.sheet_count || 0} feuille${(s.sheet_count || 0) > 1 ? 's' : ''}`);
  if (s.last_sheet_on) bits.push(dateRelative(s.last_sheet_on));
  return `
    <button class="row-item" data-subject="${esc(s.id)}">
      <span class="swatch" style="background:${esc(c)}">${esc(subjectBadge(s))}</span>
      <span class="grow">
        <span class="ttl">${esc(s.name)}</span>
        <span class="sub">${esc(bits.join(' · '))}</span>
      </span>
      <span class="chev">${icon('chevronR')}</span>
    </button>`;
}
