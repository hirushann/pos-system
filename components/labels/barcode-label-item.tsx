'use client';

import * as React from 'react';
import { generateBarcodeSvg } from '@/src/lib/barcode';
import { formatLKR } from '@/src/lib/money';

export interface LabelProductData {
  id: number;
  name: string;
  partNumber: string;
  price: string;
  internalBarcode: string;
}

interface BarcodeLabelItemProps {
  product: LabelProductData;
  shopName: string;
  showPrice: boolean;
  layout: 'thermal' | 'a4';
}

export function BarcodeLabelItem({
  product,
  shopName,
  showPrice,
  layout,
}: BarcodeLabelItemProps) {
  const svgString = React.useMemo(() => {
    if (!product.internalBarcode) return '';
    // Generate Code 128 with guaranteed quiet zone padding
    const height = layout === 'thermal' ? 9 : 7;
    return generateBarcodeSvg(product.internalBarcode, {
      height,
      paddingwidth: 10,
    });
  }, [product.internalBarcode, layout]);

  if (layout === 'thermal') {
    return (
      <div className="label-thermal-card flex flex-col justify-between items-center text-black bg-white select-none overflow-hidden border border-black/10">
        {/* Row 1: Shop Name */}
        <div className="w-full text-center text-[7px] font-semibold uppercase tracking-wider text-black/70 truncate px-1 pt-0.5">
          {shopName}
        </div>

        {/* Row 2: Part Name */}
        <div className="w-full text-center text-[8.5px] font-bold text-black truncate px-1 leading-tight">
          {product.name}
        </div>

        {/* Row 3: Part Number & Optional Selling Price */}
        <div className="w-full flex items-center justify-between px-1.5 text-[8px] font-mono leading-none">
          <span className="font-bold text-black truncate">{product.partNumber}</span>
          {showPrice && (
            <span className="font-bold text-black whitespace-nowrap pl-1">
              {formatLKR(product.price)}
            </span>
          )}
        </div>

        {/* Row 4: Barcode SVG with intact quiet zones */}
        <div className="w-full flex flex-col items-center justify-center px-1">
          <div
            className="w-full flex justify-center items-center overflow-visible"
            style={{ maxHeight: '9mm' }}
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
          {/* Row 5: Digits */}
          <span className="font-mono text-[7.5px] tracking-widest text-black font-semibold leading-none pt-0.5">
            {product.internalBarcode}
          </span>
        </div>
      </div>
    );
  }

  // A4 sheet: 38.1 x 21.2 mm
  return (
    <div className="label-a4-card flex flex-col justify-between items-center text-black bg-white select-none overflow-hidden border border-black/10">
      {/* Row 1: Shop Name */}
      <div className="w-full text-center text-[6px] font-semibold uppercase tracking-wider text-black/70 truncate px-0.5 pt-0.5 leading-none">
        {shopName}
      </div>

      {/* Row 2: Part Name */}
      <div className="w-full text-center text-[7px] font-bold text-black truncate px-0.5 leading-tight">
        {product.name}
      </div>

      {/* Row 3: Part Number & Optional Selling Price */}
      <div className="w-full flex items-center justify-between px-1 text-[6.5px] font-mono leading-none">
        <span className="font-bold text-black truncate">{product.partNumber}</span>
        {showPrice && (
          <span className="font-bold text-black whitespace-nowrap pl-0.5">
            {formatLKR(product.price)}
          </span>
        )}
      </div>

      {/* Row 4: Barcode SVG */}
      <div className="w-full flex flex-col items-center justify-center px-0.5 pb-0.5">
        <div
          className="w-full flex justify-center items-center overflow-visible"
          style={{ maxHeight: '7mm' }}
          dangerouslySetInnerHTML={{ __html: svgString }}
        />
        {/* Row 5: Digits */}
        <span className="font-mono text-[6px] tracking-widest text-black font-semibold leading-none">
          {product.internalBarcode}
        </span>
      </div>
    </div>
  );
}
