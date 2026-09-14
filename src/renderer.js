import { E } from './elements.js';

// 8-shade palette per element for organic texture. Index picked by the cell's
// `variation` byte (emissive elements flicker via life+frame instead).
const PALETTES = [
  // EMPTY — dark background
  [[10, 12, 18], [11, 13, 19], [10, 12, 18], [11, 13, 19], [10, 12, 18], [11, 13, 19], [10, 12, 18], [11, 13, 19]],
  // SAND — warm tans
  [[222, 180, 110], [214, 172, 102], [228, 188, 118], [210, 166, 98], [224, 184, 112], [218, 176, 106], [230, 192, 122], [212, 170, 100]],
  // WALL — cool grey-blue
  [[124, 132, 146], [116, 124, 138], [130, 138, 152], [112, 120, 134], [126, 134, 148], [118, 126, 140], [132, 140, 154], [114, 122, 136]],
  // WATER — blues
  [[52, 120, 220], [46, 112, 210], [58, 128, 228], [42, 106, 200], [54, 122, 222], [48, 114, 212], [60, 132, 232], [44, 108, 204]],
  // WOOD — browns
  [[130, 92, 52], [122, 86, 48], [138, 98, 56], [118, 82, 44], [134, 94, 54], [124, 88, 50], [140, 100, 58], [120, 84, 46]],
  // FIRE — hot core to red edge (flicker-indexed)
  [[255, 244, 170], [255, 224, 120], [255, 196, 80], [255, 164, 52], [250, 132, 40], [240, 104, 34], [226, 84, 30], [200, 64, 28]],
  // SMOKE — greys
  [[112, 112, 118], [104, 104, 110], [120, 120, 126], [98, 98, 104], [116, 116, 122], [106, 106, 112], [124, 124, 130], [100, 100, 106]],
  // LAVA — glowing orange/yellow (flicker-indexed)
  [[255, 208, 80], [255, 180, 52], [255, 152, 36], [255, 124, 24], [248, 96, 20], [255, 172, 48], [255, 140, 28], [244, 88, 18]],
  // STONE — dark grey
  [[104, 106, 112], [98, 100, 106], [110, 112, 118], [94, 96, 102], [106, 108, 114], [100, 102, 108], [112, 114, 120], [96, 98, 104]],
  // STEAM — pale blue-grey
  [[178, 188, 204], [170, 180, 196], [186, 196, 212], [164, 174, 190], [182, 192, 208], [172, 182, 198], [188, 198, 214], [168, 178, 194]],
  // CINDER — charred ash
  [[74, 66, 60], [68, 60, 54], [80, 72, 66], [64, 56, 50], [76, 68, 62], [70, 62, 56], [82, 74, 68], [66, 58, 52]],
];

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.grid = grid;
    const w = grid.w;
    const h = grid.h;
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // Offscreen buffer at simulation resolution; scaled up crisply by CSS.
    this.off = document.createElement('canvas');
    this.off.width = w;
    this.off.height = h;
    this.octx = this.off.getContext('2d');
    this.img = this.octx.createImageData(w, h);

    // Feature-detect canvas filter support (glow pass is added in a later task).
    this.supportsFilter = typeof this.ctx.filter === 'string';
  }

  render(frame) {
    const { cells, life, variation } = this.grid;
    const data = this.img.data;
    const n = cells.length;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const id = cells[i];
      const pal = PALETTES[id];
      let k;
      if (id === E.FIRE || id === E.LAVA) {
        // Flicker: index derived from remaining life + frame for a living glow.
        k = (life[i] * 5 + frame * 11 + variation[i]) % pal.length;
      } else {
        k = variation[i] & 7;
      }
      const c = pal[k];
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);

    // Blit the sim-resolution buffer onto the visible canvas (identity transform;
    // CSS scales it up with image-rendering: pixelated for crisp pixels).
    this.ctx.drawImage(this.off, 0, 0);
  }
}
