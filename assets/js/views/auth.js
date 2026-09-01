/* Écrans hors application : configuration Supabase et connexion. */

import { icon } from '../icons.js';
import { el, esc, toast, errMsg } from '../ui.js';
import { getConfig, saveConfig, signIn, signUp } from '../supa.js';

const MARQUE = `
  <div class="brand-mark">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v13"/>
      <path d="M4 5.5V19a2 2 0 0 0 2 2h13"/><path d="M8 7h7M8 11h7"/>
    </svg>
  </div>`;

/* ------------------------------------------------ 1. CONFIGURATION INITIALE */

export function renderSetup() {
  const cfg = getConfig();
  const root = el(`
    <div class="center-page">
      <div class="box">
        ${MARQUE}
        <h1 style="text-align:center;margin-bottom:6px">Connecter Carnet</h1>
        <p style="text-align:center;color:var(--txt-3);font-size:.89rem;margin-bottom:22px">
          Renseigne ton projet Supabase pour démarrer.
        </p>
        <div class="card pad">
          <div class="field">
            <label>URL du projet</label>
            <input class="input" data-url value="${esc(cfg.supabaseUrl)}"
                   placeholder="https://xxxx.supabase.co" autocapitalize="off" spellcheck="false">
          </div>
          <div class="field">
            <label>Clé publique (anon)</label>
            <input class="input" data-key value="${esc(cfg.supabaseAnonKey)}"
                   placeholder="eyJhbGciOi…" autocapitalize="off" spellcheck="false">
          </div>
          <button class="btn primary block" data-go>${icon('check')}<span>Continuer</span></button>
          <p class="hint">
            Dashboard Supabase → <strong>Settings → API</strong> :
            « Project URL » et la clé « anon / public ».
            N'utilise jamais la clé <em>service_role</em> ici.
          </p>
        </div>
      </div>
    </div>`);

  root.querySelector('[data-go]').addEventListener('click', () => {
    const url = root.querySelector('[data-url]').value.trim();
    const key = root.querySelector('[data-key]').value.trim();
    if (!/^https?:\/\/.+/.test(url) || key.length < 20) {
      toast('URL ou clé incomplète.', 'err');
      return;
    }
    saveConfig({ supabaseUrl: url, supabaseAnonKey: key });
    location.reload();
  });
  return root;
}

/* -------------------------------------------------------- 2. CONNEXION     */

export function renderLogin() {
  let mode = 'connexion';

  const root = el(`
    <div class="center-page">
      <div class="box">
        ${MARQUE}
        <h1 style="text-align:center;margin-bottom:6px">Carnet</h1>
        <p style="text-align:center;color:var(--txt-3);font-size:.89rem;margin-bottom:22px" data-sous>
          Tes feuilles de cours, rangées.
        </p>
        <form class="card pad" data-form>
          <div class="field">
            <label>Adresse e-mail</label>
            <input class="input" type="email" data-email required autocomplete="email"
                   autocapitalize="off" spellcheck="false" placeholder="prenom.nom@etu.uphf.fr">
          </div>
          <div class="field">
            <label>Mot de passe</label>
            <input class="input" type="password" data-pass required minlength="6"
                   autocomplete="current-password" placeholder="••••••••">
          </div>
          <button class="btn primary block" type="submit" data-submit>Se connecter</button>
        </form>
        <p style="text-align:center;margin-top:16px;font-size:.87rem;color:var(--txt-3)">
          <a href="#" data-toggle>Créer un compte</a>
          &nbsp;·&nbsp;
          <a href="#" data-config>Changer de projet</a>
        </p>
      </div>
    </div>`);

  const form = root.querySelector('[data-form]');
  const bouton = root.querySelector('[data-submit]');

  root.querySelector('[data-toggle]').addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'connexion' ? 'inscription' : 'connexion';
    bouton.textContent = mode === 'connexion' ? 'Se connecter' : 'Créer mon compte';
    root.querySelector('[data-toggle]').textContent =
      mode === 'connexion' ? 'Créer un compte' : "J'ai déjà un compte";
    root.querySelector('[data-sous]').textContent =
      mode === 'connexion' ? 'Tes feuilles de cours, rangées.' : 'Un seul compte suffit : le tien.';
    root.querySelector('[data-pass]').autocomplete =
      mode === 'connexion' ? 'current-password' : 'new-password';
  });

  root.querySelector('[data-config]').addEventListener('click', (e) => {
    e.preventDefault();
    saveConfig({ supabaseUrl: '', supabaseAnonKey: '' });
    location.reload();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = root.querySelector('[data-email]').value.trim();
    const pass = root.querySelector('[data-pass]').value;
    bouton.disabled = true;
    try {
      if (mode === 'connexion') {
        await signIn(email, pass);
        location.reload();
      } else {
        const res = await signUp(email, pass);
        if (res?.session) location.reload();
        else {
          toast('Compte créé : confirme ton adresse via le lien reçu par e-mail.', 'ok', 6000);
          bouton.disabled = false;
        }
      }
    } catch (err) {
      toast(errMsg(err), 'err', 5000);
      bouton.disabled = false;
    }
  });

  return root;
}
