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
  /** The product's preferred supplier, printed on the label when enabled. */
  supplierName?: string | null;
}

interface BarcodeLabelItemProps {
  product: LabelProductData;
  shopName: string;
  showPrice: boolean;
  showSupplier?: boolean;
  layout: 'thermal' | 'a4';
}

export function BarcodeLabelItem({
  product,
  shopName,
  showPrice,
  showSupplier = false,
  layout,
}: BarcodeLabelItemProps) {
  // A supplier line takes a little room, so the barcode is a touch shorter when it is shown
  const supplier = showSupplier ? product.supplierName?.trim() || null : null;
  const svgString = React.useMemo(() => {
    if (!product.internalBarcode) return '';
    // Generate Code 128 with guaranteed quiet zone padding
    const height = layout === 'thermal' ? (supplier ? 7.5 : 9) : supplier ? 5.5 : 7;
    return generateBarcodeSvg(product.internalBarcode, {
      height,
      paddingwidth: 10,
    });
  }, [product.internalBarcode, layout, supplier]);

  if (layout === 'thermal') {
    return (
      <div
        className="label-thermal-card flex flex-col justify-between items-center text-black bg-white select-none overflow-hidden"
        style={{ width: '50mm', height: '25mm', padding: '1.5mm 2mm', boxSizing: 'border-box' }}
      >
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

        {/* Supplier */}
        {supplier && (
          <div className="w-full text-center text-[7px] font-semibold text-black truncate px-1.5 leading-none">
            {supplier}
          </div>
        )}

        {/* Row 4: Barcode SVG with intact quiet zones */}
        <div className="w-full flex flex-col items-center justify-center px-1">
          <div
            className="w-full overflow-hidden"
            style={{ height: supplier ? '7.5mm' : '9mm' }}
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
    <div
      className="label-a4-card flex flex-col justify-between items-center text-black bg-white select-none overflow-hidden"
      style={{ width: '38.1mm', height: '21.2mm', padding: '1mm 1.2mm', boxSizing: 'border-box' }}
    >
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

      {/* Supplier */}
      {supplier && (
        <div className="w-full text-center text-[6px] font-semibold text-black truncate px-1 leading-none">
          Supplier: {supplier}
        </div>
      )}

      {/* Row 4: Barcode SVG */}
      <div className="w-full flex flex-col items-center justify-center px-0.5 pb-0.5">
        <div
          className="w-full overflow-hidden"
          style={{ height: supplier ? '5.5mm' : '7mm' }}
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
