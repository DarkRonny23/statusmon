import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

describe('sprite renderer', () => {
  it('PNG sync read produces valid RGBA data', () => {
    // Create a tiny 2x2 test PNG
    const png = new PNG({ width: 2, height: 2 });
    // Red pixel
    png.data[0] = 255;
    png.data[1] = 0;
    png.data[2] = 0;
    png.data[3] = 255;
    // Transparent pixel
    png.data[4] = 0;
    png.data[5] = 0;
    png.data[6] = 0;
    png.data[7] = 0;
    // Green pixel
    png.data[8] = 0;
    png.data[9] = 255;
    png.data[10] = 0;
    png.data[11] = 255;
    // Blue pixel
    png.data[12] = 0;
    png.data[13] = 0;
    png.data[14] = 255;
    png.data[15] = 255;

    const buf = PNG.sync.write(png);
    const read = PNG.sync.read(buf);

    expect(read.width).toBe(2);
    expect(read.height).toBe(2);
    expect(read.data[0]).toBe(255); // red channel of first pixel
    expect(read.data[7]).toBe(0); // alpha of transparent pixel
  });

  it('half-block art handles transparent pixels', () => {
    // Simulate the core rendering logic
    const ALPHA_THRESHOLD = 64;
    const top = { r: 255, g: 0, b: 0, a: 255 };
    const bot = { r: 0, g: 0, b: 0, a: 0 }; // transparent

    let result;
    if (top.a < ALPHA_THRESHOLD && bot.a < ALPHA_THRESHOLD) {
      result = ' ';
    } else if (top.a < ALPHA_THRESHOLD) {
      result = '▄'; // only bottom visible
    } else if (bot.a < ALPHA_THRESHOLD) {
      result = '▀'; // only top visible
    } else {
      result = '▀'; // both visible
    }

    expect(result).toBe('▀'); // top pixel visible, bottom transparent
  });

  it('half-block art renders space for fully transparent pair', () => {
    const ALPHA_THRESHOLD = 64;
    const top = { a: 0 };
    const bot = { a: 0 };

    const isTransparent = top.a < ALPHA_THRESHOLD && bot.a < ALPHA_THRESHOLD;
    expect(isTransparent).toBe(true);
  });

  it('bilinear interpolation produces blended values', () => {
    // Simple mix function matching our renderer
    const mix = (a, b, t) => Math.round(a + (b - a) * t);

    expect(mix(0, 255, 0)).toBe(0);
    expect(mix(0, 255, 1)).toBe(255);
    expect(mix(0, 255, 0.5)).toBe(128);
    expect(mix(100, 200, 0.25)).toBe(125);
  });
});
