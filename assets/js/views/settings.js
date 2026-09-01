/* Réglages : emploi du temps, matières, apparence, compte, connexion. */

import { icon } from '../icons.js';
import { el, esc, toast, errMsg, dateLong, hhmm, confirmDialog } from '../ui.js';
import { state, prefs, setPref, patchSettings, refreshSubjects,
         creerMatieresDepuisEdt } from '../state.js';
import { getConfig, saveConfig, signOut } from '../supa.js';
import { fetchIcs, parseIcs } from '../ics.js';
import { seedRows } from '../seed.js';
import * as db from '../db.js';

/* Utilisé aussi par la page Emploi du temps. */
export async function synchroniserEdt() {
  const url = state.settings?.ics_url;
  if (!url) throw new Error("Aucun lien ICS enregistré.");
  const { text } = await fetchIcs(url, { allowPublicRelay: !!prefs().relaisPublic });
  const events = parseIcs(text);
  if (!events.length) throw new Error('Calendrier vide : vérifie le lien.');
  await patchSettings({ ics_url: url, ics_events: events, ics_synced_at: new Date().toISOString() });
  return events.length;
}

export async function render() {
  const cfg = getConfig();
  const p = prefs();

  const root = el(`
    <div>
      <h1 style="margin-bottom:18px">Réglages</h1>

      <!-- ------------------------------------------------ emploi du temps -->
      <div class="section">
        <div class="section-head"><h2>Emploi du temps</h2></div>
        <div class="card pad">
          <div class="field">
            <label>Lien ICS de ton planning</label>
            <input class="input" data-ics value="${esc(state.settings?.ics_url || '')}"
                   placeholder="https://…/jsp/custom/modules/plannings/anonymous_cal.jsp?…">
            <p class="hint" data-etat></p>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn primary" data-sync>${icon('refresh')}<span>Synchroniser</span></button>
            <button class="btn" data-import>${icon('upload')}<span>Importer un .ics</span></button>
          </div>
          <label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;
                 font-size:.84rem;color:var(--txt-2);cursor:pointer">
            <input type="checkbox" data-relais ${p.relaisPublic ? 'checked' : ''} style="margin-top:3px">
            <span>Autoriser un relais public si l'accès direct échoue.
              <span style="color:var(--txt-3)">Ton lien de planning transitera alors par un service tiers
              (allorigins / corsproxy). Préfère l'Edge Function si tu peux.</span></span>
          </label>

          <details style="margin-top:14px">
            <summary style="cursor:pointer;font-size:.86rem;font-weight:600;color:var(--txt-2)">
              Où trouver ce lien&nbsp;?</summary>
            <div style="font-size:.85rem;color:var(--txt-2);margin-top:10px;line-height:1.6">
              <p>Depuis l'ENT de ton université, ouvre ton emploi du temps (ADE / Hyperplanning /
                 « Mon planning »), puis cherche&nbsp;:</p>
              <p style="margin-left:14px">
                • un bouton <strong>Exporter</strong>, <strong>S'abonner</strong> ou une icône calendrier&nbsp;;<br>
                • une option <strong>« Exporter au format iCal / ICS »</strong> ou
                  <strong>« Générer un lien »</strong>&nbsp;;<br>
                • choisis une période large (l'année scolaire) et copie l'URL proposée.
              </p>
              <p>L'URL ressemble à <code style="font-family:var(--mono);font-size:.9em">
                 https://…/anonymous_cal.jsp?resources=1234&amp;projectId=…</code> ou finit par
                 <code style="font-family:var(--mono);font-size:.9em">.ics</code>.
                 Une adresse en <code style="font-family:var(--mono);font-size:.9em">webcal://</code>
                 fonctionne aussi.</p>
              <p>Si ton université ne propose aucun lien, télécharge le fichier <code>.ics</code>
                 et utilise « Importer un .ics » : à refaire quand ton planning change.</p>
            </div>
          </details>
          <input type="file" accept=".ics,text/calendar" class="sr-only" data-file>
        </div>
      </div>

      <!-- --------------------------------------------------------- matières -->
      <div class="section">
        <div class="section-head"><h2>Matières</h2>
          <a class="link" href="#/matieres">Gérer ${icon('chevronR')}</a></div>
        <div class="card pad">
          <p class="hint" style="margin-top:0">
            ${state.subjects.length
              ? `${state.subjects.length} matière${state.subjects.length > 1 ? 's' : ''} enregistrée${state.subjects.length > 1 ? 's' : ''}.`
              : 'Aucune matière pour le moment.'}
          </p>
          <button class="btn primary block" data-depuis-edt ${state.events.length ? '' : 'disabled'}>
            ${icon('calendar')}<span>Créer les matières depuis l'emploi du temps</span>
          </button>
          <p class="hint">
            ${state.events.length
              ? `La méthode la plus fiable : les codes et intitulés sont lus dans ton
                 propre planning, donc conformes à ton IUT.`
              : `Synchronise d'abord ton emploi du temps ci-dessus pour utiliser cette option.`}
          </p>
          <div class="divider"></div>
          <p class="hint" style="margin-top:0">
            À défaut, le programme national du BUT Informatique. Attention : la
            numérotation varie d'un IUT à l'autre, vérifie les codes ensuite.
          </p>
          <div class="row">
            <button class="btn" data-seed="S1">Ajouter le S1</button>
            <button class="btn" data-seed="S2">Ajouter le S2</button>
          </div>
        </div>
      </div>

      <!-- -------------------------------------------------------- apparence -->
      <div class="section">
        <div class="section-head"><h2>Apparence</h2></div>
        <div class="card pad">
          <div class="field" style="margin-bottom:0">
            <label>Thème</label>
            <select class="select" data-theme>
              <option value="auto"  ${(p.theme || 'auto') === 'auto' ? 'selected' : ''}>Système</option>
              <option value="light" ${p.theme === 'light' ? 'selected' : ''}>Clair</option>
              <option value="dark"  ${p.theme === 'dark' ? 'selected' : ''}>Sombre</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ----------------------------------------------------------- compte -->
      <div class="section">
        <div class="section-head"><h2>Compte</h2></div>
        <div class="card pad">
          <div class="row-item" style="border:none;padding:0;background:none;cursor:default">
            <span class="swatch" style="background:var(--accent-2);color:var(--accent)">${icon('key')}</span>
            <span class="grow">
              <span class="ttl">${esc(state.user?.email || '')}</span>
              <span class="sub">connecté sur ce navigateur</span>
            </span>
          </div>
          <button class="btn block danger" data-logout style="margin-top:14px">
            ${icon('logout')}<span>Se déconnecter</span></button>
        </div>
      </div>

      <!-- --------------------------------------------------------- connexion -->
      <div class="section">
        <div class="section-head"><h2>Connexion Supabase</h2></div>
        <div class="card pad">
          <div class="field">
            <label>URL du projet</label>
            <input class="input" data-url value="${esc(cfg.supabaseUrl)}" placeholder="https://xxxx.supabase.co">
          </div>
          <div class="field">
            <label>Clé publique (anon)</label>
            <input class="input" data-key type="password" value="${esc(cfg.supabaseAnonKey)}">
          </div>
          <div class="field">
            <label>Relais ICS (Edge Function) <span style="font-weight:400;color:var(--txt-3)">— optionnel</span></label>
            <input class="input" data-proxy value="${esc(cfg.icsProxy)}"
                   placeholder="https://xxxx.supabase.co/functions/v1/ics-proxy">
          </div>
          <button class="btn block" data-save-cfg>${icon('check')}<span>Enregistrer</span></button>
          <p class="hint">Ces valeurs sont conservées dans ce navigateur et prennent le pas
             sur celles du fichier <code>config.js</code>.</p>
        </div>
      </div>

      <!-- ---------------------------------------------------------- données -->
      <div class="section">
        <div class="section-head"><h2>Mes données</h2></div>
        <div class="card pad">
          <button class="btn block" data-export>${icon('download')}<span>Exporter l'index (JSON)</span></button>
          <p class="hint">Sauvegarde la liste de tes feuilles, matières et chapitres.
             Les images restent dans Supabase Storage.</p>
        </div>
      </div>

      <p class="hint" style="text-align:center;padding:10px 0 20px">Carnet · données hébergées sur ton propre projet Supabase</p>
    </div>`);

  const $ = (s) => root.querySelector(s);

  /* -------------------------------------------------------- emploi du temps */
  function majEtat() {
    const e = $('[data-etat]');
    if (state.settings?.ics_synced_at) {
      const d = new Date(state.settings.ics_synced_at);
      e.textContent = `${state.events.length} cours en mémoire · dernière synchro le `
        + `${dateLong(d)} à ${hhmm(d)}`;
    } else {
      e.textContent = "Pas encore synchronisé.";
    }
  }
  majEtat();

  $('[data-sync]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const url = $('[data-ics]').value.trim();
    if (!url) { toast('Colle d’abord le lien ICS.', 'err'); return; }
    b.disabled = true;
    try {
      await patchSettings({ ics_url: url });
      const n = await synchroniserEdt();
      majEtat();
      toast(`${n} cours importés`);
    } catch (err) {
      toast(errMsg(err), 'err', 6000);
    }
    b.disabled = false;
  });

  $('[data-import]').addEventListener('click', () => $('[data-file]').click());
  $('[data-file]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const events = parseIcs(await f.text());
      if (!events.length) throw new Error('Aucun cours trouvé dans ce fichier.');
      await patchSettings({ ics_events: events, ics_synced_at: new Date().toISOString() });
      majEtat();
      toast(`${events.length} cours importés`);
    } catch (err) { toast(errMsg(err), 'err'); }
  });

  $('[data-relais]').addEventListener('change', (e) => {
    setPref('relaisPublic', e.target.checked);
  });

  /* ---------------------------------------------------------------- matières */
  $('[data-depuis-edt]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const { crees, total, noms } = await creerMatieresDepuisEdt();
      if (!total) {
        toast("Aucune matière repérée dans l'emploi du temps.", 'err', 4000);
      } else if (!crees) {
        toast(`Les ${total} matières du planning existent déjà.`);
      } else {
        toast(`${crees} matière${crees > 1 ? 's créées' : ' créée'} : ${noms.join(', ')}`, 'ok', 5000);
      }
    } catch (err) { toast(errMsg(err), 'err'); }
    b.disabled = false;
  });

  root.addEventListener('click', async (e) => {
    const seed = e.target.closest('[data-seed]');
    if (!seed) return;
    const sem = seed.dataset.seed;
    if (state.subjects.some((s) => s.semester === sem)) {
      const ok = await confirmDialog({
        title: `Ajouter à nouveau le ${sem} ?`,
        message: `Des matières du ${sem} existent déjà. Elles seront dupliquées.`,
        confirmLabel: 'Ajouter quand même'
      });
      if (!ok) return;
    }
    seed.disabled = true;
    try {
      await db.createSubjects(seedRows(sem, state.subjects.length));
      await refreshSubjects();
      toast(`Matières du ${sem} ajoutées`);
    } catch (err) { toast(errMsg(err), 'err'); }
    seed.disabled = false;
  });

  /* --------------------------------------------------------------- apparence */
  $('[data-theme]').addEventListener('change', (e) => {
    setPref('theme', e.target.value);
    appliquerTheme(e.target.value);
  });

  /* ------------------------------------------------------------------ compte */
  $('[data-logout]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Se déconnecter ?', message: 'Tu devras ressaisir ton mot de passe.',
      confirmLabel: 'Se déconnecter', danger: true
    });
    if (ok) { await signOut(); location.hash = '#/'; location.reload(); }
  });

  /* --------------------------------------------------------------- connexion */
  $('[data-save-cfg]').addEventListener('click', () => {
    saveConfig({
      supabaseUrl: $('[data-url]').value.trim(),
      supabaseAnonKey: $('[data-key]').value.trim(),
      icsProxy: $('[data-proxy]').value.trim()
    });
    toast('Configuration enregistrée — rechargement…');
    setTimeout(() => location.reload(), 700);
  });

  /* ----------------------------------------------------------------- export */
  $('[data-export]').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const [feuilles, matieres, chapitres] = await Promise.all([
        db.listSheets({ limit: 5000 }), db.listSubjects({ archived: null }), db.listChapters(null)
      ]);
      const blob = new Blob(
        [JSON.stringify({ exporte_le: new Date().toISOString(), matieres, chapitres, feuilles }, null, 2)],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carnet-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) { toast(errMsg(err), 'err'); }
    b.disabled = false;
  });

  return root;
}

/** Applique le thème choisi au document. */
export function appliquerTheme(valeur) {
  const html = document.documentElement;
  if (valeur === 'light' || valeur === 'dark') html.dataset.theme = valeur;
  else delete html.dataset.theme;
}
