/* Page d'accueil : le cours du moment, l'emploi du temps du jour,
 * les derniers scans et ce qui reste à ranger. */

import { icon } from '../icons.js';
import { el, esc, dateLong, hhmm, toDay, colorFor, errMsg, toast } from '../ui.js';
import * as db from '../db.js';
import { state } from '../state.js';
import { eventsOfDay, matchSubject, prettySummary } from '../ics.js';
import { sheetGrid, emptyState } from '../components.js';

export async function render() {
  const root = el('<div></div>');
  const today = toDay();
  const events = eventsOfDay(state.events, today);
  const now = new Date();

  /* ------------------------------------------------------------- en-tête */
  root.appendChild(el(`
    <div class="section" style="margin-bottom:18px">
      <div class="eyebrow">${esc(dateLong(new Date()))}</div>
      <h1 style="margin-top:4px">${esc(salutation())}</h1>
    </div>`));

  /* --------------------------------------------------- bandeaux d'amorçage */
  if (!state.subjects.length) {
    const b = el(`
      <div class="banner info" style="margin-bottom:16px">
        ${icon('sparkle')}
        <div class="grow">
          <strong>Première étape :</strong> ajoute tes matières pour pouvoir ranger tes feuilles.
        </div>
      </div>`);
    const btn = el(`<button class="btn sm primary">Ajouter</button>`);
    btn.addEventListener('click', () => { location.hash = '#/reglages'; });
    b.appendChild(btn);
    root.appendChild(b);
  } else if (!state.settings?.ics_url && !state.events.length) {
    const b = el(`
      <div class="banner info" style="margin-bottom:16px">
        ${icon('calendar')}
        <div class="grow">Ajoute ton emploi du temps pour voir tes cours du jour ici.</div>
      </div>`);
    const btn = el(`<button class="btn sm">Configurer</button>`);
    btn.addEventListener('click', () => { location.hash = '#/reglages'; });
    b.appendChild(btn);
    root.appendChild(b);
  }

  /* ------------------------------------------------------ bouton principal */
  const cta = el(`
    <button class="btn primary lg block" style="margin-bottom:24px">
      ${icon('camera')}<span>Scanner une feuille</span>
    </button>`);
  cta.addEventListener('click', () => { location.hash = '#/scan'; });
  root.appendChild(cta);

  /* -------------------------------------------------- emploi du temps jour */
  if (events.length) {
    const sec = el(`
      <div class="section">
        <div class="section-head">
          <h2>Aujourd'hui</h2>
          <a class="link" href="#/edt">La semaine ${icon('chevronR')}</a>
        </div>
        <div class="edt"></div>
      </div>`);
    const list = sec.querySelector('.edt');

    events.forEach((ev) => {
      const start = new Date(ev.start), end = new Date(ev.end);
      const live = start <= now && now <= end;
      const past = end < now;
      const subject = matchSubject(ev.summary, state.subjects);
      const color = subject?.color || colorFor(ev.summary);
      const item = el(`
        <button class="edt-item ${live ? 'now' : ''} ${past ? 'past' : ''}"
                data-subject="${esc(subject?.id || '')}">
          <span class="when">${esc(hhmm(start))}<span class="end">${esc(hhmm(end))}</span></span>
          <span class="rule" style="background:${esc(color)}"></span>
          <span class="body">
            <span class="ttl">${esc(prettySummary(ev.summary))}</span>
            <span class="sub">${esc([ev.location, subject?.code].filter(Boolean).join(' · ') || '—')}</span>
          </span>
          ${live ? '<span class="live">en cours</span>' : `<span class="chev">${icon('camera')}</span>`}
        </button>`);
      item.addEventListener('click', () => {
        const s = item.dataset.subject;
        location.hash = s ? `#/scan?matiere=${s}` : '#/scan';
      });
      list.appendChild(item);
    });
    root.appendChild(sec);
  } else if (state.events.length) {
    root.appendChild(el(`
      <div class="section">
        <div class="section-head"><h2>Aujourd'hui</h2>
          <a class="link" href="#/edt">La semaine ${icon('chevronR')}</a></div>
        <div class="card pad" style="color:var(--txt-3);font-size:.9rem">
          ${icon('sun')} Aucun cours aujourd'hui.
        </div>
      </div>`));
  }

  /* -------------------------------------------------------- derniers scans */
  const recent = el(`
    <div class="section">
      <div class="section-head">
        <h2>Derniers scans</h2>
        <a class="link" href="#/recherche">Tout voir ${icon('chevronR')}</a>
      </div>
      <div data-slot><div class="hscroll">
        ${'<div class="skeleton" style="height:210px"></div>'.repeat(4)}
      </div></div>
    </div>`);
  root.appendChild(recent);

  /* ------------------------------------------------------------ à ranger */
  const unfiled = el('<div class="section" data-unfiled></div>');
  root.appendChild(unfiled);

  /* -------------------------------------------------- chargement asynchrone */
  (async () => {
    try {
      const [derniers, aRanger] = await Promise.all([
        db.listSheets({ limit: 12 }),
        db.listSheets({ unfiled: true, limit: 12 })
      ]);

      const slot = recent.querySelector('[data-slot]');
      slot.innerHTML = '';
      if (derniers.length) {
        slot.appendChild(sheetGrid(derniers, { horizontal: true }));
      } else {
        slot.appendChild(emptyState({
          ico: 'camera',
          title: 'Aucune feuille pour l’instant',
          text: 'Scanne ta première feuille en rentrant de cours : elle apparaîtra ici.',
          action: { label: 'Scanner', icon: 'camera', onClick: () => { location.hash = '#/scan'; } }
        }));
      }

      if (aRanger.length) {
        unfiled.innerHTML = `
          <div class="section-head">
            <h2>À ranger</h2>
            <span class="chip warn">${aRanger.length}</span>
          </div>`;
        unfiled.appendChild(sheetGrid(aRanger, { horizontal: true }));
      }
    } catch (e) {
      recent.querySelector('[data-slot]').innerHTML =
        `<div class="banner">${icon('alert')}<div class="grow">${esc(errMsg(e))}</div></div>`;
      toast(errMsg(e), 'err');
    }
  })();

  return root;
}

function salutation() {
  const h = new Date().getHours();
  if (h < 5) return 'Encore debout ?';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
