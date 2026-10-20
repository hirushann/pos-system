'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import type { ImportPreview, ImportSummary, PlannedAction } from '@/src/data/product-import';

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import so the page can reload its data. */
  onImported: () => void;
}

type Phase = 'idle' | 'checking' | 'preview' | 'importing' | 'done';

const ACTION_STYLE: Record<PlannedAction, { label: string; className: string }> = {
  create: { label: 'Add', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  update: { label: 'Update', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  unchanged: { label: 'No change', className: 'bg-muted text-muted-foreground' },
  error: { label: 'Error', className: 'bg-destructive/15 text-destructive' },
};

const MAX_ROWS_SHOWN = 300;

export function ProductImportDialog({ open, onOpenChange, onImported }: ProductImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [skipInvalid, setSkipInvalid] = React.useState(false);
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Start fresh every time the dialog opens
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setFile(null);
      setPhase('idle');
      setPreview(null);
      setSummary(null);
      setError(null);
      setSkipInvalid(false);
      setOnlyProblems(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  const send = async (chosen: File, mode: 'preview' | 'commit') => {
    const form = new FormData();
    form.append('file', chosen);
    form.append('mode', mode);
    if (mode === 'commit' && skipInvalid) form.append('skipInvalid', '1');
    const res = await fetch('/api/products/import', { method: 'POST', body: form });
    const body = await res.json().catch(() => null);
    return { res, body };
  };

  const handleFileChosen = async (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    setError(null);
    setPreview(null);
    setPhase('checking');
    try {
      const { res, body } = await send(chosen, 'preview');
      if (!res.ok || !body?.ok) {
        setError(body?.error || 'Could not read the file.');
        setPhase('idle');
        return;
      }
      setPreview(body.preview as ImportPreview);
      setPhase('preview');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setPhase('idle');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setPhase('importing');
    setError(null);
    try {
      const { res, body } = await send(file, 'commit');
      if (!res.ok || !body?.ok) {
        setError(body?.error || 'The import failed and nothing was saved.');
        if (body?.preview) setPreview(body.preview as ImportPreview);
        setPhase('preview');
        return;
      }
      setSummary(body.summary as ImportSummary);
      setPhase('done');
      onImported();
    } catch {
      setError('Could not reach the server. Nothing was saved.');
      setPhase('preview');
    }
  };

  const toImport = preview ? preview.counts.create + preview.counts.update : 0;
  const hasErrors = (preview?.counts.error ?? 0) > 0;
  const canImport =
    phase === 'preview' && !!preview && preview.fileErrors.length === 0 && toImport > 0 && (!hasErrors || skipInvalid);

  const rows = React.useMemo(() => {
    if (!preview) return [];
    const list = onlyProblems
      ? preview.rows.filter((r) => r.action === 'error' || r.warnings.length > 0)
      : preview.rows;
    return list.slice(0, MAX_ROWS_SHOWN);
  }, [preview, onlyProblems]);

  const busy = phase === 'checking' || phase === 'importing';

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import products from CSV
          </DialogTitle>
          <DialogDescription>
            A row with a SKU updates that product. A row with an empty SKU is added as a new product,
            and its SKU is generated. Stock of existing products is never changed by an import.
          </DialogDescription>
        </DialogHeader>

        {phase === 'done' && summary ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Import finished</span>
            </div>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <li className="rounded-lg border p-3"><b>{summary.created}</b> added</li>
              <li className="rounded-lg border p-3"><b>{summary.updated}</b> updated</li>
              <li className="rounded-lg border p-3"><b>{summary.unchanged}</b> already up to date</li>
              <li className="rounded-lg border p-3"><b>{summary.skipped}</b> skipped (errors)</li>
              <li className="rounded-lg border p-3"><b>{summary.categoriesCreated}</b> new categories</li>
              <li className="rounded-lg border p-3"><b>{summary.brandsCreated}</b> new brands</li>
            </ul>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Step 1: choose a file */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void handleFileChosen(e.target.files?.[0]);
                  e.target.value = ''; // allow choosing the same file again after fixing it
                }}
              />
              <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                {file ? 'Choose another file' : 'Choose CSV file'}
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {file ? file.name : 'No file chosen'}
              </span>
              <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
                <a href="/api/products/export?template=1" download>
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </a>
              </Button>
            </div>

            {phase === 'checking' && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking the file...
              </p>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            {/* Step 2: what would happen */}
            {preview && (
              <div className="space-y-3">
                {preview.fileErrors.map((message) => (
                  <p key={message} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{message}</span>
                  </p>
                ))}
                {preview.fileWarnings.map((message) => (
                  <p key={message} className="text-xs text-amber-700 dark:text-amber-400">{message}</p>
                ))}

                {preview.fileErrors.length === 0 && (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge className={ACTION_STYLE.create.className}>{preview.counts.create} to add</Badge>
                      <Badge className={ACTION_STYLE.update.className}>{preview.counts.update} to update</Badge>
                      <Badge className={ACTION_STYLE.unchanged.className}>{preview.counts.unchanged} no change</Badge>
                      <Badge className={ACTION_STYLE.error.className}>{preview.counts.error} with errors</Badge>
                    </div>

                    {(preview.newCategories.length > 0 || preview.newBrands.length > 0) && (
                      <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                        <p className="mb-1 font-semibold">These will be created. Check them for typos:</p>
                        {preview.newCategories.length > 0 && (
                          <p>Categories: <b>{preview.newCategories.join(', ')}</b></p>
                        )}
                        {preview.newBrands.length > 0 && <p>Brands: <b>{preview.newBrands.join(', ')}</b></p>}
                      </div>
                    )}

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={onlyProblems}
                        onChange={(e) => setOnlyProblems(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      Show only rows with errors or warnings
                    </label>

                    <div className="max-h-72 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="w-14">Row</TableHead>
                            <TableHead className="w-32">SKU</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-24">Action</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                Nothing to show.
                              </TableCell>
                            </TableRow>
                          ) : (
                            rows.map((r) => (
                              <TableRow key={r.rowNumber} className={r.action === 'error' ? 'bg-destructive/5' : undefined}>
                                <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {r.sku || <span className="text-muted-foreground">(new)</span>}
                                </TableCell>
                                <TableCell className="max-w-56 truncate text-xs">{r.name}</TableCell>
                                <TableCell>
                                  <Badge className={`${ACTION_STYLE[r.action].className} text-[10px]`}>
                                    {ACTION_STYLE[r.action].label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="space-y-0.5 text-xs">
                                  {r.errors.map((m) => (
                                    <p key={m} className="text-destructive">{m}</p>
                                  ))}
                                  {r.changes.map((m) => (
                                    <p key={m} className="text-muted-foreground">{m}</p>
                                  ))}
                                  {r.warnings.map((m) => (
                                    <p key={m} className="text-amber-700 dark:text-amber-400">{m}</p>
                                  ))}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {preview.rows.length > MAX_ROWS_SHOWN && !onlyProblems && (
                      <p className="text-xs text-muted-foreground">
                        Showing the first {MAX_ROWS_SHOWN} of {preview.rows.length} rows. Every row is imported.
                      </p>
                    )}

                    {hasErrors && (
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={skipInvalid}
                          onChange={(e) => setSkipInvalid(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-input"
                        />
                        <span>
                          Skip the {preview.counts.error} row{preview.counts.error === 1 ? '' : 's'} with errors and import
                          the rest. Otherwise, fix the file and choose it again.
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canImport || busy} onClick={handleImport} className="gap-1.5">
                {phase === 'importing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {toImport > 0 ? `Import ${toImport} product${toImport === 1 ? '' : 's'}` : 'Import'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
