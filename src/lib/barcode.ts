import bwipjs from 'bwip-js';

/**
 * Generate a random internal barcode: '20' followed by 8 random digits,
 * e.g. '2048173906'. The '20' prefix marks it as an in-house code (it falls in
 * the GS1 "store use" range, so it can't clash with manufacturer barcodes).
 * Uniqueness is enforced by the database; callers retry on a collision.
 */
export function generateInternalBarcode(): string {
  // Rejection sampling keeps all 8-digit values equally likely (no modulo bias).
  const limit = Math.floor(0x100000000 / 100_000_000) * 100_000_000;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return '20' + String(buf[0] % 100_000_000).padStart(8, '0');
}

/**
 * Validate internal barcode format: starts with '20' followed by exactly 8 digits
 */
export function isValidInternalBarcode(code: string): boolean {
  return /^20\d{8}$/.test(code);
}

export interface BarcodeSvgOptions {
  height?: number;
  paddingwidth?: number;
  scale?: number;
}

/**
 * Generate Code 128 SVG string using bwip-js with quiet zone padding
 */
export function generateBarcodeSvg(code: string, options: BarcodeSvgOptions = {}): string {
  const { height = 10, paddingwidth = 10 } = options;
  try {
    const svg = (bwipjs as unknown as { toSVG: (opts: Record<string, unknown>) => string }).toSVG({
      bcid: 'code128',
      text: code,
      height,
      paddingwidth,
      includetext: false,
    });
    // bwip-js emits only a viewBox, so the SVG would stretch to the full width of
    // its container. Fill the parent box instead and keep the aspect ratio, so the
    // label markup alone decides the physical size of the barcode.
    return svg.replace(
      /^<svg /,
      '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block" ',
    );
  } catch (err) {
    console.error('Failed to generate barcode SVG for code:', code, err);
    return '';
  }
}
