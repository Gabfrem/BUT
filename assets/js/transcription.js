/* Fenêtre de transcription : lance l'OCR, affiche le texte, permet de le
 * corriger et de l'enregistrer. Le texte enregistré alimente ocr_text, donc
 * l'index de recherche plein texte. */

import { icon } from './icons.js';
import { el, esc, openModal, toast, errMsg } from './ui.js';
import * as db from './db.js';
import { transcrire } from './ocr.js';

/**
 * @param {object} feuille  ligne de sheet_overview (id, title, ocr_text…)
 * @param {{onSaved?:(texte:string)=>void}} opts
 */
export function openTranscription(feuille, { onSaved } = {}) {
  let texte = feuille.ocr_text || '';
  let enCours = false;

  const body = el(`
    <div>
      <div data-etat></div>
      <div data-zone class="hidden">
        <textarea class="textarea" data-texte spellcheck="true"
          style="min-height:44vh;font-size:15px;line-height:1.6"></textarea>
        <p class="hint" data-info></p>
      </div>
    </div>`);

  const etat = body.querySelector('[data-etat]');
  const zone = body.querySelector('[data-zone]');
  const champ = body.querySelector('[data-texte]');
  const info = body.querySelector('[data-info]');

  let boutonPrincipal;
  const modal = openModal({
    title: 'Texte de la feuille',
    body,
    actions: [
      { label: 'Fermer', onClick: ({ close }) => close() },
      {
        label: 'Enregistrer', kind: 'primary', icon: 'check',
        ref: (b) => { boutonPrincipal = b; },
        onClick: enregistrer
      }
    ]
  });

  /* ------------------------------------------------------------- affichage */
  function montrerTexte(confiance) {
    zone.classList.remove('hidden');
    champ.value = texte;
    info.textContent = confiance != null
      ? `Transcription automatique — confiance ${confiance} %. `
        + `Corrige ce qu'il a mal lu : c'est le texte corrigé qui sera enregistré et recherchable.`
      : `Texte enregistré. Tu peux le modifier, ou le refaire à partir des images.`;
    etat.innerHTML = '';
    const refaire = el(`<button class="btn block" style="margin-bottom:14px">
      ${icon('refresh')}<span>${texte ? 'Refaire la transcription' : 'Transcrire'}</span></button>`);
    refaire.addEventListener('click', lancer);
    etat.appendChild(refaire);
  }

  function montrerDepart() {
    etat.innerHTML = `
      <div class="banner info" style="margin-bottom:14px">${icon('info')}
        <div class="grow">
          Le moteur lit très bien un texte imprimé, correctement une écriture
          détachée, et mal une écriture cursive rapide. Considère le résultat
          comme un brouillon à corriger.
        </div>
      </div>`;
    const b = el(`<button class="btn primary block lg">${icon('sparkle')}
      <span>Transcrire la feuille</span></button>`);
    b.addEventListener('click', lancer);
    etat.appendChild(b);
  }

  /* --------------------------------------------------------------- moteur  */
  async function lancer() {
    if (enCours) return;
    enCours = true;
    zone.classList.add('hidden');
    etat.innerHTML = `
      <div class="card pad" style="text-align:center">
        <div class="progress" style="margin-bottom:12px"><i data-barre></i></div>
        <div data-libelle style="font-size:.88rem;color:var(--txt-2)">Préparation…</div>
      </div>`;
    const barre = etat.querySelector('[data-barre]');
    const libelle = etat.querySelector('[data-libelle]');
    boutonPrincipal.disabled = true;

    try {
      const pages = await db.listPages(feuille.id);
      if (!pages.length) throw new Error('Cette feuille ne contient aucune image.');
      const map = await db.signedUrls(pages.map((p) => p.storage_path));
      const urls = pages.map((p) => map.get(p.storage_path)).filter(Boolean);
      if (!urls.length) throw new Error('Images inaccessibles.');

      const res = await transcrire(urls, {
        onProgress: ({ ratio, texte: etape }) => {
          barre.style.width = `${Math.round(ratio * 100)}%`;
          libelle.textContent = etape;
        }
      });

      texte = res.texte || '';
      if (!texte) {
        toast("Aucun texte n'a pu être lu sur cette feuille.", 'err', 4000);
      }
      montrerTexte(res.confiance);
    } catch (e) {
      etat.innerHTML = `<div class="banner">${icon('alert')}
        <div class="grow">${esc(errMsg(e))}</div></div>`;
      const b = el('<button class="btn block" style="margin-top:12px">Réessayer</button>');
      b.addEventListener('click', lancer);
      etat.appendChild(b);
    }
    boutonPrincipal.disabled = false;
    enCours = false;
  }

  /* ----------------------------------------------------------- sauvegarde  */
  async function enregistrer({ close, button }) {
    const valeur = champ.value.trim();
    if (!valeur && !feuille.ocr_text) { close(); return; }
    button.disabled = true;
    try {
      await db.updateSheet(feuille.id, { ocr_text: valeur || null });
      feuille.ocr_text = valeur || null;
      toast(valeur ? 'Texte enregistré' : 'Texte effacé');
      onSaved?.(valeur);
      close();
    } catch (e) {
      button.disabled = false;
      toast(errMsg(e), 'err');
    }
  }

  if (texte) montrerTexte(null);
  else montrerDepart();

  return modal;
}
