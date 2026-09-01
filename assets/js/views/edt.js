/* Emploi du temps de la semaine, à partir du flux ICS mis en cache. */

import { icon } from '../icons.js';
import { el, esc, dateLong, hhmm, toDay, colorFor, toast, errMsg } from '../ui.js';
import { state } from '../state.js';
import { eventsOfDay, matchSubject, prettySummary } from '../ics.js';
import { synchroniserEdt } from './settings.js';

export async function render() {
  let lundi = debutSemaine(new Date());

  const root = el(`
    <div>
      <div class="section-head" style="margin-bottom:14px">
        <h1>Emploi du temps</h1>
        <button class="icon-btn" data-sync title="Synchroniser">${icon('refresh')}</button>
      </div>
      <div class="row" style="align-items:center;margin-bottom:16px">
        <button class="btn sm" data-prev style="flex:0 0 auto">${icon('chevronL')}</button>
        <div data-label style="text-align:center;font-weight:600;font-size:.92rem"></div>
        <button class="btn sm" data-next style="flex:0 0 auto">${icon('chevronR')}</button>
      </div>
      <div data-body></div>
    </div>`);

  const body = root.querySelector('[data-body]');

  function dessiner() {
    const fin = new Date(lundi); fin.setDate(fin.getDate() + 6);
    root.querySelector('[data-label]').textContent =
      `${lundi.getDate()} → ${fin.getDate()} ${moisCourt(fin)}`;

    if (!state.events.length) {
      body.innerHTML = `
        <div class="empty">
          <div class="ico">${icon('calendar')}</div>
          <h3>Pas encore d'emploi du temps</h3>
          <p>Ajoute le lien ICS de ton planning (ou importe le fichier .ics)
             dans les réglages : tes cours du jour apparaîtront sur l'accueil.</p>
          <a class="btn primary" href="#/reglages">${icon('settings')} Configurer</a>
        </div>`;
      return;
    }

    const jours = [...Array(7)].map((_, i) => {
      const d = new Date(lundi); d.setDate(d.getDate() + i);
      return d;
    });
    const aujourdhui = toDay();

    body.innerHTML = '';
    let total = 0;
    jours.forEach((d) => {
      const cle = toDay(d);
      const evs = eventsOfDay(state.events, cle);
      total += evs.length;
      if (!evs.length) return;
      const sec = el(`
        <div class="section">
          <div class="section-head">
            <h2 style="font-size:.98rem">${esc(dateLong(d))}</h2>
            ${cle === aujourdhui ? '<span class="chip accent">aujourd\'hui</span>' : ''}
          </div>
          <div class="edt"></div>
        </div>`);
      const liste = sec.querySelector('.edt');
      evs.forEach((ev) => {
        const s = new Date(ev.start), e = new Date(ev.end);
        const matiere = matchSubject(ev.summary, state.subjects);
        const item = el(`
          <button class="edt-item" data-matiere="${esc(matiere?.id || '')}">
            <span class="when">${esc(hhmm(s))}<span class="end">${esc(hhmm(e))}</span></span>
            <span class="rule" style="background:${esc(matiere?.color || colorFor(ev.summary))}"></span>
            <span class="body">
              <span class="ttl">${esc(prettySummary(ev.summary))}</span>
              <span class="sub">${esc([ev.location, matiere?.code].filter(Boolean).join(' · ') || '—')}</span>
            </span>
            <span class="chev">${icon('camera')}</span>
          </button>`);
        item.addEventListener('click', () => {
          const id = item.dataset.matiere;
          location.hash = id ? `#/scan?matiere=${id}` : '#/scan';
        });
        liste.appendChild(item);
      });
      body.appendChild(sec);
    });

    if (!total) {
      body.appendChild(el(`
        <div class="card pad" style="text-align:center;color:var(--txt-3)">
          ${icon('sun')}<div style="margin-top:6px">Aucun cours cette semaine.</div>
        </div>`));
    }
  }

  root.querySelector('[data-prev]').addEventListener('click', () => {
    lundi.setDate(lundi.getDate() - 7); dessiner();
  });
  root.querySelector('[data-next]').addEventListener('click', () => {
    lundi.setDate(lundi.getDate() + 7); dessiner();
  });
  root.querySelector('[data-sync]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const n = await synchroniserEdt();
      toast(`${n} cours synchronisés`);
      dessiner();
    } catch (err) { toast(errMsg(err), 'err'); }
    b.disabled = false;
  });

  dessiner();
  return root;
}

function debutSemaine(d) {
  const x = new Date(d);
  const j = (x.getDay() + 6) % 7;      // lundi = 0
  x.setDate(x.getDate() - j);
  x.setHours(0, 0, 0, 0);
  return x;
}

function moisCourt(d) {
  return ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
          'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getMonth()];
}
