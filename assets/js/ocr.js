/* Transcription automatique des pages scannées (Tesseract.js, côté navigateur).
 *
 * Honnêteté d'ingénieur : Tesseract est un moteur conçu pour des caractères
 * typographiques. Il est très bon sur un polycopié imprimé, correct sur une
 * écriture manuscrite bien détachée, et mauvais sur de l'écriture cursive
 * rapide. C'est pourquoi le résultat est toujours présenté comme un brouillon
 * modifiable : le texte corrigé à la main est ce qui finit en base.
 *
 * La bibliothèque et le modèle de langue sont téléchargés à la demande, au
 * premier usage seulement (le navigateur les garde ensuite en cache).
 */

const CDN_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';

let chargement = null;

/** Charge la bibliothèque une seule fois. */
export function chargerMoteur() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (chargement) return chargement;
  chargement = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CDN_TESSERACT;
    s.async = true;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => {
      chargement = null;
      reject(new Error("Impossible de charger le moteur de transcription (connexion ?)."));
    };
    document.head.appendChild(s);
  });
  return chargement;
}

/** Récupère une image de Supabase Storage sous forme de Blob. */
async function telecharger(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Image inaccessible (HTTP ${r.status}).`);
  return r.blob();
}

/**
 * Transcrit une liste d'images.
 * @param {string[]} urls        URLs signées des pages, dans l'ordre
 * @param {{onProgress?:(p:{ratio:number, texte:string})=>void, langue?:string}} opts
 * @returns {Promise<{texte:string, confiance:number}>}
 */
export async function transcrire(urls, { onProgress, langue = 'fra' } = {}) {
  const Tesseract = await chargerMoteur();
  const total = urls.length || 1;
  const avance = (i, p, etape) => onProgress?.({
    ratio: Math.min(1, (i + p) / total),
    texte: etape
  });

  avance(0, 0, 'Préparation du moteur…');

  const worker = await Tesseract.createWorker(langue, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') return;      // géré page par page
      avance(0, 0, etapeLisible(m.status));
    }
  });

  const morceaux = [];
  const confiances = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const blob = await telecharger(urls[i]);
      avance(i, 0.1, `Lecture de la page ${i + 1} sur ${urls.length}…`);

      const { data } = await worker.recognize(blob, {}, { text: true });
      morceaux.push(nettoyer(data.text));
      confiances.push(data.confidence ?? 0);
      avance(i, 1, `Page ${i + 1} sur ${urls.length} lue`);
    }
  } finally {
    await worker.terminate();
  }

  const texte = morceaux
    .map((t, i) => (urls.length > 1 ? `— page ${i + 1} —\n\n${t}` : t))
    .join('\n\n')
    .trim();

  return {
    texte,
    confiance: Math.round(confiances.reduce((a, b) => a + b, 0) / (confiances.length || 1))
  };
}

/** Met un peu d'ordre dans la sortie brute du moteur. */
function nettoyer(brut) {
  return String(brut || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')          // espaces en fin de ligne
    .replace(/\n{3,}/g, '\n\n')          // pas plus d'une ligne vide
    .replace(/[|]{2,}/g, '')             // artefacts de lignes de cahier
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').trim())
    .join('\n')
    .trim();
}

function etapeLisible(status = '') {
  const m = {
    'loading tesseract core': 'Chargement du moteur…',
    'initializing tesseract': 'Initialisation…',
    'loading language traineddata': 'Téléchargement du modèle français (~6 Mo, une seule fois)…',
    'initializing api': 'Préparation…',
    'initialized api': 'Prêt.'
  };
  return m[status] || 'Préparation…';
}
