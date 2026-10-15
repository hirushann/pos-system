#!/usr/bin/env node
/*
 * Print agent: lets the POS website print straight to a dot-matrix printer.
 *
 * A web page cannot talk to a printer's built-in fonts, so the POS builds the invoice
 * as plain text + ESC/P commands (src/lib/escp-invoice.ts) and POSTs those bytes to this
 * tiny program running on the shop computer. It hands them to the printer UNCHANGED
 * (CUPS "raw" mode), so the printer draws the text with its own sharp fonts.
 *
 * Usage (on the Mac that the LQ-310 is plugged into):
 *   PRINTER_QUEUE=LQ310_RAW ALLOWED_ORIGINS=https://pos.dayzsolutions.com node scripts/print-agent.mjs
 *
 * Environment:
 *   PRINTER_QUEUE     CUPS queue name to print to (see `lpstat -p`)           [required]
 *   ALLOWED_ORIGINS   comma-separated website origins allowed to print        [default http://localhost:3000]
 *   PORT              port to listen on, localhost only                       [default 9101]
 *   PRINT_COMMAND     (testing) shell command that receives the bytes on stdin instead of `lp`
 *
 * Safety: listens on 127.0.0.1 only, accepts only the allowed website origins, and only
 * accepts data that starts with the ESC/P reset code (ESC @) produced by the POS.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 9101);
const QUEUE = process.env.PRINTER_QUEUE || '';
const PRINT_COMMAND = process.env.PRINT_COMMAND || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_BYTES = 256 * 1024;

if (!QUEUE && !PRINT_COMMAND) {
  console.error('PRINTER_QUEUE is not set. Find your printer queue name with:  lpstat -p');
  console.error('Then run:  PRINTER_QUEUE=<queue name> node scripts/print-agent.mjs');
  process.exit(1);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Chrome asks permission for public websites to reach a local program
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json', ...(origin ? corsHeaders(origin) : {}) };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function runPrint(data) {
  return new Promise((resolve, reject) => {
    const child = PRINT_COMMAND
      ? spawn(PRINT_COMMAND, { shell: true })
      : spawn('lp', ['-d', QUEUE, '-o', 'raw']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `print command exited with code ${code}`));
    });
    child.stdin.on('error', () => {}); // a command that exits early closes the pipe
    child.stdin.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin);
  const url = new URL(req.url || '/', 'http://127.0.0.1');

  // Health check: also fine without an Origin header (e.g. curl)
  if (req.method === 'GET' && url.pathname === '/health') {
    if (origin && !allowed) return send(res, 403, { ok: false, error: 'origin not allowed' });
    return send(res, 200, { ok: true, queue: QUEUE || null }, allowed ? origin : '');
  }

  if (!allowed) return send(res, 403, { ok: false, error: 'origin not allowed' });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/print') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) return send(res, 413, { ok: false, error: 'too large' }, origin);
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (data.length < 3 || data[0] !== 0x1b || data[1] !== 0x40) {
      return send(res, 400, { ok: false, error: 'not an ESC/P invoice' }, origin);
    }
    try {
      const output = await runPrint(data);
      console.log(`${new Date().toISOString()} printed ${data.length} bytes${output ? ` (${output})` : ''}`);
      return send(res, 200, { ok: true, output }, origin);
    } catch (err) {
      console.error('print failed:', err.message);
      return send(res, 500, { ok: false, error: err.message }, origin);
    }
  }

  return send(res, 404, { ok: false, error: 'not found' }, origin);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Print agent listening on http://127.0.0.1:${PORT}`);
  console.log(`  printer queue : ${QUEUE || '(custom PRINT_COMMAND)'}`);
  console.log(`  allowed sites : ${ALLOWED_ORIGINS.join(', ')}`);
});
