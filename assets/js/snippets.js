/* Code écrit en cours ou en TP, rattaché à un chapitre.
 *
 * Pas de coloration syntaxique : elle imposerait une bibliothèque externe pour
 * un gain purement esthétique. L'essentiel est ici — une police à chasse fixe,
 * la tabulation qui indente au lieu de sortir du champ, et un bouton copier. */

import { icon } from './icons.js';
import { el, esc, openModal, toast, errMsg, dateRelative, confirmDialog, promptDialog } from './ui.js';
import * as db from './db.js';
import { state, chaptersFor, invalidateChapters } from './state.js';

export const LANGAGES = [
  { id: 'python',     label: 'Python',     ext: 'py' },
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'java',       label: 'Java',       ext: 'java' },
  { id: 'c',          label: 'C',          ext: 'c' },
  { id: 'cpp',        label: 'C++',        ext: 'cpp' },
  { id: 'sql',        label: 'SQL',        ext: 'sql' },
  { id: 'html',       label: 'HTML',       ext: 'html' },
  { id: 'css',        label: 'CSS',        ext: 'css' },
  { id: 'php',        label: 'PHP',        ext: 'php' },
  { id: 'bash',       label: 'Shell',      ext: 'sh' },
  { id: 'autre',      label: 'Autre',      ext: 'txt' }
];

const langue = (id) => LANGAGES.find((l) => l.id === id) || LANGAGES[LANGAGES.length - 1];

/** Ligne d'un extrait de code dans une liste. */
export function snippetRowHtml(s) {
  const lignes = (s.content || '').split('\n').length;
  const bits = [langue(s.language).label, s.chapter_name,
                `${lignes} ligne${lignes > 1 ? 's' : ''}`, dateRelative(s.updated_at)]
    .filter(Boolean).join(' · ');
  return `
    <div class="row-item" data-snippet="${esc(s.id)}">
      <span class="swatch" style="background:#1d4ed81f;color:#1d4ed8">${icon('code')}</span>
      <span class="grow">
        <span class="ttl">${esc(s.title)}</span>
        <span class="sub">${esc(bits)}</span>
      </span>
      <span class="chev">${icon('chevronR')}</span>
    </div>`;
}

/* ------------------------------------------------------------- AFFICHAGE  */

/** Vue lecture : le code avec numéros de ligne et bouton copier. */
export function openSnippetViewer(snippet, { onChange } = {}) {
  const lignes = (snippet.content || '').split('\n');
  const body = el(`
    <div>
      <div class="chips" style="margin-bottom:12px">
        <span class="chip accent">${esc(langue(snippet.language).label)}</span>
        ${snippet.chapter_name ? `<span class="chip">${esc(snippet.chapter_name)}</span>` : ''}
        <span class="chip">${esc(dateRelative(snippet.updated_at))}</span>
      </div>
      ${snippet.note ? `<p class="hint" style="margin:0 0 12px">${esc(snippet.note)}</p>` : ''}
      <div class="code-block">
        <ol>${lignes.map((l) => `<li>${esc(l) || '&nbsp;'}</li>`).join('')}</ol>
      </div>
    </div>`);

  openModal({
    title: snippet.title,
    body,
    actions: [
      {
        label: 'Copier', icon: 'file',
        onClick: async ({ button }) => {
          try {
            await navigator.clipboard.writeText(snippet.content || '');
            button.querySelector('span').textContent = 'Copié';
            setTimeout(() => { button.querySelector('span').textContent = 'Copier'; }, 1600);
          } catch { toast('Copie impossible sur ce navigateur.', 'err'); }
        }
      },
      {
        label: 'Modifier', kind: 'primary', icon: 'pencil',
        onClick: ({ close }) => {
          close();
          openSnippetEditor(snippet, { onDone: onChange });
        }
      }
    ]
  });
}

/* --------------------------------------------------------------- ÉDITION  */

/**
 * Création ou modification d'un extrait de code.
 * @param {object|null} snippet  null => création
 * @param {{subjectId?, chapterId?, onDone?:Function}} opts
 */
export function openSnippetEditor(snippet = null, { subjectId = null, chapterId = null, onDone } = {}) {
  let lang = snippet?.language || 'python';
  let sujetSel = snippet?.subject_id ?? subjectId ?? null;
  let chapSel = snippet?.chapter_id ?? chapterId ?? null;

  const body = el(`
    <div>
      <div class="field">
        <label>Titre</label>
        <input class="input" data-titre value="${esc(snippet?.title || '')}"
               placeholder="ex. Tri par insertion">
      </div>
      <div class="field">
        <label>Langage</label>
        <div class="pick" data-langs></div>
      </div>
      <div class="field">
        <label>Code</label>
        <textarea class="textarea code-input" data-code spellcheck="false"
          autocapitalize="off" autocorrect="off"
          placeholder="colle ou tape ton code ici…">${esc(snippet?.content || '')}</textarea>
        <p class="hint">La touche Tab indente au lieu de changer de champ.</p>
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
        <textarea class="textarea" data-note style="min-height:60px"
          placeholder="ce que fait ce code, ce qui coince…">${esc(snippet?.note || '')}</textarea>
      </div>
    </div>`);

  const zoneLangs = body.querySelector('[data-langs]');
  const zoneSujets = body.querySelector('[data-subjects]');
  const zoneChaps = body.querySelector('[data-chapters]');
  const champChap = body.querySelector('[data-chapter-field]');
  const champCode = body.querySelector('[data-code]');

  /* Tab indente au lieu de sortir du champ : indispensable pour du Python. */
  champCode.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: d, selectionEnd: f, value } = champCode;
    champCode.value = `${value.slice(0, d)}    ${value.slice(f)}`;
    champCode.selectionStart = champCode.selectionEnd = d + 4;
  });

  const dessinerLangs = () => {
    zoneLangs.innerHTML = LANGAGES.map((l) =>
      `<button type="button" data-l="${l.id}" class="${l.id === lang ? 'on' : ''}">${esc(l.label)}</button>`
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

  zoneLangs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]');
    if (!b) return;
    lang = b.dataset.l;
    dessinerLangs();
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
        title: 'Nouveau chapitre', label: 'Nom du chapitre', confirmLabel: 'Créer'
      });
      if (!nom) return;
      try {
        const liste = await chaptersFor(sujetSel);
        const c = await db.createChapter(sujetSel, nom, liste.length);
        invalidateChapters(sujetSel);
        chapSel = c.id;
        await dessinerChapitres();
      } catch (err) { toast(errMsg(err), 'err'); }
      return;
    }
    const b = e.target.closest('[data-c]');
    if (!b) return;
    chapSel = b.dataset.c || null;
    dessinerChapitres();
  });

  dessinerLangs();
  dessinerSujets();
  dessinerChapitres();

  const actions = [];
  if (snippet) {
    actions.push({
      label: 'Supprimer', kind: 'danger',
      onClick: async ({ close }) => {
        const ok = await confirmDialog({
          title: 'Supprimer ce code ?',
          message: `« ${snippet.title} » sera définitivement effacé.`,
          confirmLabel: 'Supprimer', danger: true
        });
        if (!ok) return;
        try {
          await db.deleteSnippet(snippet.id);
          toast('Code supprimé');
          onDone?.(null);
          close();
        } catch (e) { toast(errMsg(e), 'err'); }
      }
    });
  } else {
    actions.push({ label: 'Annuler', onClick: ({ close }) => close() });
  }

  actions.push({
    label: 'Enregistrer', kind: 'primary', icon: 'check',
    onClick: async ({ close, button }) => {
      const payload = {
        title: body.querySelector('[data-titre]').value.trim(),
        language: lang,
        content: champCode.value,
        subject_id: sujetSel,
        chapter_id: chapSel,
        note: body.querySelector('[data-note]').value.trim() || null
      };
      if (!payload.title) { body.querySelector('[data-titre]').focus(); return; }
      button.disabled = true;
      try {
        const row = snippet
          ? await db.updateSnippet(snippet.id, payload)
          : await db.createSnippet(payload);
        toast(snippet ? 'Code modifié' : 'Code enregistré');
        onDone?.(row);
        close();
      } catch (e) { button.disabled = false; toast(errMsg(e), 'err'); }
    }
  });

  openModal({ title: snippet ? 'Modifier le code' : 'Nouveau code', body, actions });
}
