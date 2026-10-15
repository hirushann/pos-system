'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Printer, ImageIcon } from 'lucide-react';
import {
  PRINT_AGENT_URL,
  base64ToBytes,
  checkPrintAgent,
  sendToPrintAgent,
} from '@/src/lib/print-agent-client';

interface TextInvoiceViewProps {
  saleId: number;
  receiptNumber: string;
  /** What the printed form(s) will look like. */
  preview: string;
  /** The ESC/P bytes for the printer, base64 encoded. */
  bytesBase64: string;
  formCount: number;
  /** Print as soon as the page opens (used right after a sale). */
  autoPrint: boolean;
}

type AgentState = 'checking' | 'online' | 'offline';

export function TextInvoiceView({
  saleId,
  receiptNumber,
  preview,
  bytesBase64,
  formCount,
  autoPrint,
}: TextInvoiceViewProps) {
  const [agent, setAgent] = React.useState<AgentState>('checking');
  const [isPrinting, setIsPrinting] = React.useState(false);
  const bytes = React.useMemo(() => base64ToBytes(bytesBase64), [bytesBase64]);

  const printNow = React.useCallback(async () => {
    setIsPrinting(true);
    const result = await sendToPrintAgent(bytes);
    setIsPrinting(false);
    if (result.ok) {
      toast.success(`Sent ${receiptNumber} to the printer`);
      try {
        sessionStorage.setItem(`printed:${receiptNumber}`, '1');
      } catch {
        // storage can be blocked; printing still worked
      }
    } else {
      toast.error(result.error || 'Printing failed');
      setAgent('offline');
    }
    return result.ok;
  }, [bytes, receiptNumber]);

  // Check the agent once; print automatically right after a sale (only once per invoice)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const online = await checkPrintAgent();
      if (cancelled) return;
      setAgent(online ? 'online' : 'offline');
      if (!online || !autoPrint) return;
      let alreadyPrinted = false;
      try {
        alreadyPrinted = sessionStorage.getItem(`printed:${receiptNumber}`) === '1';
      } catch {
        // ignore
      }
      if (!alreadyPrinted) await printNow();
    })();
    return () => {
      cancelled = true;
    };
  }, [autoPrint, printNow, receiptNumber]);

  const download = () => {
    const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receiptNumber}.prn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-muted/40 py-6 px-3 flex flex-col items-center gap-4">
      <div className="flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link href="/checkout">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to POS</span>
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Link href={`/sales/${saleId}/invoice`} target="_blank">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Graphics invoice</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={download} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            <span>Download .prn</span>
          </Button>
          <Button
            size="sm"
            onClick={printNow}
            disabled={isPrinting}
            className="gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{isPrinting ? 'Printing...' : 'Print to LQ-310'}</span>
          </Button>
        </div>
      </div>

      <div className="w-full max-w-3xl rounded-lg border bg-card px-4 py-3 text-xs">
        {agent === 'checking' && <p className="text-muted-foreground">Checking the print agent...</p>}
        {agent === 'online' && (
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            Print agent connected. {formCount > 1 ? `${formCount} forms will print.` : 'One form will print.'}
          </p>
        )}
        {agent === 'offline' && (
          <div className="space-y-1.5 text-muted-foreground">
            <p className="font-medium text-foreground">
              The print agent is not running on this computer ({PRINT_AGENT_URL}).
            </p>
            <p>
              Start it in Terminal:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                npm run print-agent
              </code>{' '}
              (set <code className="font-mono">PRINTER_QUEUE</code> and{' '}
              <code className="font-mono">ALLOWED_ORIGINS</code> first; see the README, &ldquo;Printing on the
              Epson LQ-310&rdquo;). Or use <strong>Download .prn</strong> and print the file with{' '}
              <code className="font-mono">lp -d QUEUE -o raw</code>.
            </p>
          </div>
        )}
      </div>

      {/* On-screen copy of what will print (printer fonts are drawn by the printer itself) */}
      <div className="w-full max-w-3xl overflow-x-auto rounded-lg border bg-white p-4 shadow-md">
        <pre
          className="m-0 text-black"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '12px',
            lineHeight: 1.35,
            whiteSpace: 'pre',
          }}
        >
          {preview}
        </pre>
      </div>
    </div>
  );
}
