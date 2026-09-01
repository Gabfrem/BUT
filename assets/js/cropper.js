/* Recadrage tactile d'une page scannée.
 * Les coordonnées manipulées sont normalisées (0..1) et s'appliquent APRÈS
 * la rotation, comme attendu par imaging.renderToCanvas(). */

import { el, openModal } from './ui.js';

const MIN = 0.08;   // taille minimale d'un côté du cadre

/**
 * @param {string} imageUrl  aperçu déjà tourné
 * @param {{x,y,w,h}|null} initial
 * @returns {Promise<{x,y,w,h}|null|'reset'>}
 */
export function openCropper(imageUrl, initial = null) {
  return new Promise((resolve) => {
    let done = false;
    let box = initial ? { ...initial } : { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };

    const body = el(`
      <div style="text-align:center">
        <div class="crop-wrap" style="position:relative;display:inline-block;max-width:100%;
             line-height:0;touch-action:none;user-select:none">
          <img src="${imageUrl}" alt=""
               style="max-height:56vh;max-width:100%;display:block;border-radius:8px">
          <div class="crop-ov" style="position:absolute;inset:0"></div>
        </div>
        <p class="hint" style="text-align:center">Fais glisser les coins pour ne garder que la feuille.</p>
      </div>`);

    const wrap = body.querySelector('.crop-wrap');
    const ov = body.querySelector('.crop-ov');

    function draw() {
      const pc = (v) => `${(v * 100).toFixed(3)}%`;
      ov.innerHTML = `
        <div style="position:absolute;inset:0;box-shadow:0 0 0 9999px rgba(6,8,15,.55) inset;
             clip-path:polygon(0 0,100% 0,100% 100%,0 100%,0 0,
               ${pc(box.x)} ${pc(box.y)},
               ${pc(box.x)} ${pc(box.y + box.h)},
               ${pc(box.x + box.w)} ${pc(box.y + box.h)},
               ${pc(box.x + box.w)} ${pc(box.y)},
               ${pc(box.x)} ${pc(box.y)})"></div>
        <div data-move style="position:absolute;left:${pc(box.x)};top:${pc(box.y)};
             width:${pc(box.w)};height:${pc(box.h)};
             border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);cursor:move"></div>
        ${corner('nw', box.x, box.y)}
        ${corner('ne', box.x + box.w, box.y)}
        ${corner('sw', box.x, box.y + box.h)}
        ${corner('se', box.x + box.w, box.y + box.h)}`;
    }

    const corner = (id, x, y) => `
      <div data-h="${id}" style="position:absolute;left:${(x * 100).toFixed(3)}%;
           top:${(y * 100).toFixed(3)}%;width:34px;height:34px;margin:-17px 0 0 -17px;
           border-radius:50%;cursor:grab;display:grid;place-items:center">
        <span style="width:16px;height:16px;border-radius:50%;background:#fff;
              box-shadow:0 1px 4px rgba(0,0,0,.55)"></span>
      </div>`;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    let drag = null;
    ov.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-h]');
      const move = e.target.closest('[data-move]');
      if (!handle && !move) return;
      const r = wrap.getBoundingClientRect();
      drag = {
        mode: handle ? handle.dataset.h : 'move',
        px: (e.clientX - r.left) / r.width,
        py: (e.clientY - r.top) / r.height,
        start: { ...box },
        rect: r
      };
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    ov.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = drag.rect;
      const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
      const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
      const s = drag.start;

      if (drag.mode === 'move') {
        const dx = nx - drag.px, dy = ny - drag.py;
        box.x = clamp(s.x + dx, 0, 1 - s.w);
        box.y = clamp(s.y + dy, 0, 1 - s.h);
        box.w = s.w; box.h = s.h;
      } else {
        let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
        if (drag.mode.includes('w')) x1 = Math.min(nx, x2 - MIN);
        if (drag.mode.includes('e')) x2 = Math.max(nx, x1 + MIN);
        if (drag.mode.includes('n')) y1 = Math.min(ny, y2 - MIN);
        if (drag.mode.includes('s')) y2 = Math.max(ny, y1 + MIN);
        box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      draw();
    });

    const stop = () => { drag = null; };
    ov.addEventListener('pointerup', stop);
    ov.addEventListener('pointercancel', stop);

    draw();

    openModal({
      title: 'Recadrer',
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        {
          label: 'Tout garder',
          onClick: ({ close }) => { done = true; resolve('reset'); close(); }
        },
        {
          label: 'Appliquer', kind: 'primary', icon: 'check',
          onClick: ({ close }) => {
            done = true;
            const full = box.x < 0.01 && box.y < 0.01 && box.w > 0.98 && box.h > 0.98;
            resolve(full ? 'reset' : box);
            close();
          }
        }
      ]
    });
  });
}
