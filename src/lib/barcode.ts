import bwipjs from 'bwip-js';

/**
 * Format internal barcode: '20' + product id zero-padded to 8 digits
 * Example: product 123 -> '2000000123'
 */
export function formatInternalBarcode(productId: number): string {
  return '20' + String(productId).padStart(8, '0');
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
