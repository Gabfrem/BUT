/* Service worker : rend l'interface disponible hors ligne (la coquille seulement,
 * les données et les images viennent toujours de Supabase).
 * Change CACHE à chaque déploiement pour forcer la mise à jour. */

const CACHE = 'carnet-v3';

const COQUILLE = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './vendor/supabase.js',
  './assets/css/app.css',
  './assets/icons/icon.svg',
  './assets/js/app.js',
  './assets/js/ui.js',
  './assets/js/icons.js',
  './assets/js/supa.js',
  './assets/js/db.js',
  './assets/js/state.js',
  './assets/js/ics.js',
  './assets/js/imaging.js',
  './assets/js/cropper.js',
  './assets/js/components.js',
  './assets/js/seed.js',
  './assets/js/ocr.js',
  './assets/js/transcription.js',
  './assets/js/documents.js',
  './assets/js/snippets.js',
  './assets/js/views/home.js',
  './assets/js/views/scan.js',
  './assets/js/views/library.js',
  './assets/js/views/subject.js',
  './assets/js/views/sheet.js',
  './assets/js/views/search.js',
  './assets/js/views/edt.js',
  './assets/js/views/settings.js',
  './assets/js/views/auth.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(COQUILLE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Jamais de cache pour Supabase (API, stockage, authentification).
  if (url.origin !== location.origin || /supabase\.(co|in)$/.test(url.hostname)) return;

  e.respondWith(
    caches.match(request).then((hit) => {
      const reseau = fetch(request).then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(request, copie));
        }
        return rep;
      }).catch(() => hit);
      // Réponse immédiate depuis le cache, mise à jour en arrière-plan.
      return hit || reseau;
    })
  );
});
