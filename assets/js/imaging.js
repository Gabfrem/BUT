/* Traitement des photos de feuilles : redressement, filtres, export JPEG.
 *
 * Le filtre « document » applique une correction d'éclairage : on estime le fond
 * (la lumière ambiante + l'ombre de la main) par un fort sous-échantillonnage,
 * puis on divise l'image par ce fond. Le papier redevient blanc uniforme même
 * photographié de travers sous une lampe, et l'encre ressort nettement.
 */

export const FILTRES = [
  { id: 'document', label: 'Document' },
  { id: 'gris',     label: 'Niveaux de gris' },
  { id: 'couleur',  label: 'Couleur' },
  { id: 'brut',     label: 'Photo brute' }
];

/** Charge un fichier image en ImageBitmap (oriente selon l'EXIF). */
export async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* repli ci-dessous */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}

function dims(src) {
  return { w: src.width || src.naturalWidth, h: src.height || src.naturalHeight };
}

/**
 * Dessine la source dans un canvas en appliquant rotation puis recadrage.
 * @param {ImageBitmap|HTMLImageElement} src
 * @param {{rotate?:number, crop?:{x,y,w,h}, maxSize?:number}} opts
 *        crop en coordonnées normalisées (0..1), APRÈS rotation.
 */
export function renderToCanvas(src, { rotate = 0, crop = null, maxSize = 2200 } = {}) {
  const { w: sw, h: sh } = dims(src);
  const turned = rotate === 90 || rotate === 270;

  // 1) rotation dans un canvas intermédiaire
  const rw = turned ? sh : sw;
  const rh = turned ? sw : sh;
  const rot = document.createElement('canvas');
  rot.width = rw; rot.height = rh;
  const rctx = rot.getContext('2d');
  rctx.save();
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate((rotate * Math.PI) / 180);
  rctx.drawImage(src, -sw / 2, -sh / 2);
  rctx.restore();

  // 2) recadrage
  const c = crop
    ? { x: crop.x * rw, y: crop.y * rh, w: crop.w * rw, h: crop.h * rh }
    : { x: 0, y: 0, w: rw, h: rh };
  c.w = Math.max(16, Math.round(c.w));
  c.h = Math.max(16, Math.round(c.h));

  // 3) mise à l'échelle finale
  const scale = Math.min(1, maxSize / Math.max(c.w, c.h));
  const out = document.createElement('canvas');
  out.width = Math.round(c.w * scale);
  out.height = Math.round(c.h * scale);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(rot, c.x, c.y, c.w, c.h, 0, 0, out.width, out.height);
  return out;
}

/* ------------------------------------------------------------- FILTRES   */

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Estimation du fond lumineux : sous-échantillonnage puis ré-agrandissement. */
function backgroundData(canvas) {
  const w = canvas.width, h = canvas.height;
  const div = Math.max(6, Math.round(Math.max(w, h) / 42));   // ~40px de large
  const small = document.createElement('canvas');
  small.width = Math.max(2, Math.round(w / div));
  small.height = Math.max(2, Math.round(h / div));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, small.width, small.height);

  const big = document.createElement('canvas');
  big.width = w; big.height = h;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, w, h);
  return bctx.getImageData(0, 0, w, h);
}

/**
 * Applique un filtre au canvas (modifié sur place).
 * @param {HTMLCanvasElement} canvas
 * @param {'document'|'gris'|'couleur'|'brut'} filtre
 */
export function applyFilter(canvas, filtre = 'document') {
  if (filtre === 'brut') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  if (filtre === 'gris') {
    for (let i = 0; i < d.length; i += 4) {
      const g = luma(d[i], d[i + 1], d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  } else if (filtre === 'couleur') {
    // léger gain de contraste + saturation, sans écraser les couleurs
    const C = 1.18, S = 1.12;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) d[i + k] = clamp((d[i + k] - 128) * C + 132);
      const g = luma(d[i], d[i + 1], d[i + 2]);
      for (let k = 0; k < 3; k++) d[i + k] = clamp(g + (d[i + k] - g) * S);
    }
  } else {
    // « document » : correction d'éclairage puis courbe encre/papier
    const bg = backgroundData(canvas).data;
    const LO = 118, HI = 208, span = HI - LO;
    for (let i = 0; i < d.length; i += 4) {
      const g = luma(d[i], d[i + 1], d[i + 2]);
      const b = Math.max(24, luma(bg[i], bg[i + 1], bg[i + 2]));
      const n = Math.min(255, (g / b) * 224);          // papier ramené vers le blanc
      let v = ((n - LO) / span) * 255;                 // encre poussée vers le noir
      v = clamp(v);
      v = clamp(255 * Math.pow(v / 255, 0.86));        // adoucit les gris moyens
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/* -------------------------------------------------------------- EXPORT   */

export function canvasToBlob(canvas, quality = 0.82) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Export JPEG impossible.'))),
      'image/jpeg', quality
    );
  });
}

/**
 * Chaîne complète : source -> canvas traité -> JPEG.
 * @returns {Promise<{blob:Blob, width:number, height:number, url:string}>}
 */
export async function process(src, opts = {}) {
  const canvas = renderToCanvas(src, opts);
  applyFilter(canvas, opts.filter ?? 'document');
  const blob = await canvasToBlob(canvas, opts.quality ?? 0.82);
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    url: URL.createObjectURL(blob)
  };
}

/** Vignette rapide pour l'aperçu (pas de filtre coûteux). */
export async function thumbUrl(src, size = 260) {
  const { w, h } = dims(src);
  const s = Math.min(1, size / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, 0.8);
  return URL.createObjectURL(blob);
}
