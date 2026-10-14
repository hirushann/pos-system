'use client';

import * as React from 'react';
import { generateBarcodeSvg } from '@/src/lib/barcode';

interface BarcodeDisplayProps {
  code: string;
  className?: string;
  showDigits?: boolean;
  height?: number;
  altText?: string;
}

export function BarcodeDisplay({
  code,
  className = '',
  showDigits = true,
  height = 10,
  altText,
}: BarcodeDisplayProps) {
  const svgString = React.useMemo(() => {
    if (!code) return '';
    return generateBarcodeSvg(code, { height, paddingwidth: 10 });
  }, [code, height]);

  if (!code || !svgString) {
    return (
      <div className="flex h-12 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
        No barcode
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Container with blank quiet zone maintained */}
      <div
        className="w-full flex items-center justify-center p-1 bg-white rounded border overflow-visible"
        aria-label={altText || `Barcode for ${code}`}
        dangerouslySetInnerHTML={{ __html: svgString }}
      />
      {showDigits && (
        <span className="mt-1 font-mono text-xs tracking-wider text-muted-foreground select-all">
          {code}
        </span>
      )}
    </div>
  );
}
