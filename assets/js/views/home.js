/* Page d'accueil : le cours du moment, l'emploi du temps du jour,
 * les derniers scans et ce qui reste à ranger. */

import { icon } from '../icons.js';
import { el, esc, dateLong, hhmm, toDay, colorFor, subjectBadge, errMsg, toast } from '../ui.js';
import * as db from '../db.js';
import { state } from '../state.js';
import { eventsOfDay, matchSubject, sessionType, eventLabel, couverture } from '../ics.js';
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
  } else {
    // Un export ICS couvre une période finie : prévenir avant qu'elle s'épuise,
    // sinon l'accueil se viderait un matin sans explication.
    const c = couverture(state.events);
    if (c && c.joursRestants <= 21) {
      const passe = c.joursRestants < 0;
      const b = el(`
        <div class="banner" style="margin-bottom:16px">
          ${icon('alert')}
          <div class="grow">
            ${passe
              ? `Ton emploi du temps s'arrêtait le <strong>${esc(dateLong(c.fin))}</strong> :
                 il n'y a plus de cours à afficher.`
              : `Ton emploi du temps se termine le <strong>${esc(dateLong(c.fin))}</strong>,
                 dans ${c.joursRestants} jour${c.joursRestants > 1 ? 's' : ''}.`}
            Réexporte le <code>.ics</code> depuis l'ENT pour la suite.
          </div>
        </div>`);
      const btn = el('<button class="btn sm">Importer</button>');
      btn.addEventListener('click', () => { location.hash = '#/reglages'; });
      b.appendChild(btn);
      root.appendChild(b);
    }
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
      // Quand la matière est reconnue, son nom est bien plus lisible que le
      // libellé brut du planning (codes internes, majuscules, sans accents).
      const titre = eventLabel(ev, subject);
      const sousTitre = [sessionType(ev.summary), ev.location, subject?.code]
        .filter(Boolean).join(' · ') || '—';
      const item = el(`
        <button class="edt-item ${live ? 'now' : ''} ${past ? 'past' : ''}"
                data-subject="${esc(subject?.id || '')}">
          <span class="when">${esc(hhmm(start))}<span class="end">${esc(hhmm(end))}</span></span>
          <span class="rule" style="background:${esc(color)}"></span>
          <span class="body">
            <span class="ttl">${esc(titre)}</span>
            <span class="sub">${esc(sousTitre)}</span>
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

  /* ------------------------------- ce qu'il te faut pour la journée visée */
  // Après 19 h on bascule sur le lendemain : à cette heure-là, les cours du
  // jour sont finis et ce qu'on cherche, c'est ce qu'il faut pour demain.
  const apres19h = now.getHours() >= 19;
  const demain = new Date(now);
  demain.setDate(demain.getDate() + 1);
  const jourCible = apres19h ? toDay(demain) : today;
  const evsCible = apres19h ? eventsOfDay(state.events, jourCible) : events;

  const matieresDuJour = [...new Map(
    evsCible
      .map((ev) => matchSubject(ev.summary, state.subjects))
      .filter(Boolean)
      .map((s) => [s.id, s])
  ).values()];

  if (matieresDuJour.length) {
    const sec = el(`
      <div class="section">
        <div class="section-head">
          <h2>Pour tes cours ${apres19h ? 'de demain' : "d'aujourd'hui"}</h2>
          <span class="chip">${matieresDuJour.length} matière${matieresDuJour.length > 1 ? 's' : ''}</span>
        </div>
        <div data-slot><div class="skeleton" style="height:130px"></div></div>
      </div>`);
    root.appendChild(sec);

    (async () => {
      const slot = sec.querySelector('[data-slot]');
      try {
        const feuilles = await db.listSheets({
          subjectIds: matieresDuJour.map((s) => s.id), limit: 80
        });
        const parMatiere = new Map();
        feuilles.forEach((f) => {
          if (!parMatiere.has(f.subject_id)) parMatiere.set(f.subject_id, []);
          const lot = parMatiere.get(f.subject_id);
          if (lot.length < 8) lot.push(f);          // les plus récentes suffisent
        });

        slot.innerHTML = '';
        matieresDuJour.forEach((m) => {
          const lot = parMatiere.get(m.id) || [];
          const bloc = el(`
            <div style="margin-bottom:18px">
              <a class="row-item" href="#/matiere/${esc(m.id)}" style="margin-bottom:8px">
                <span class="swatch" style="background:${esc(m.color || colorFor(m.name))}">
                  ${esc(subjectBadge(m))}</span>
                <span class="grow">
                  <span class="ttl">${esc(m.name)}</span>
                  <span class="sub">${lot.length
                    ? `${lot.length} feuille${lot.length > 1 ? 's' : ''}`
                    : 'aucune feuille pour l’instant'}</span>
                </span>
                <span class="chev">${icon('chevronR')}</span>
              </a>
            </div>`);
          if (lot.length) bloc.appendChild(sheetGrid(lot, { horizontal: true }));
          slot.appendChild(bloc);
        });
      } catch (e) {
        slot.innerHTML = `<div class="banner">${icon('alert')}
          <div class="grow">${esc(errMsg(e))}</div></div>`;
      }
    })();
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

  /* --------------------------------------------------- à terminer / à ranger */
  const unfinished = el('<div class="section" data-unfinished></div>');
  root.appendChild(unfinished);

  const unfiled = el('<div class="section" data-unfiled></div>');
  root.appendChild(unfiled);

  /* -------------------------------------------------- chargement asynchrone */
  (async () => {
    try {
      const [derniers, aRanger, aFinir] = await Promise.all([
        db.listSheets({ limit: 12 }),
        db.listSheets({ unfiled: true, limit: 12 }),
        db.listSheets({ unfinished: true, limit: 12 })
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

      if (aFinir.length) {
        unfinished.innerHTML = `
          <div class="section-head">
            <h2>À terminer</h2>
            <a class="link" href="#/recherche?finir=1">Tout voir ${icon('chevronR')}</a>
          </div>`;
        unfinished.appendChild(sheetGrid(aFinir, { horizontal: true }));
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
