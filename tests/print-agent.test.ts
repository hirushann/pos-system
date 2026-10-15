import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 19100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const GOOD_ORIGIN = 'https://pos.example.com';
const ESC = 0x1b;

let agent: ChildProcess;
let dir: string;
let outFile: string;

async function waitForAgent() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('print agent did not start');
}

const invoiceBytes = () => Uint8Array.from([ESC, 0x40, ...Buffer.from('Hello LQ-310\r\n'), 0x0c, ESC, 0x40]);

describe('print agent', () => {
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'print-agent-'));
    outFile = path.join(dir, 'job.bin');
    agent = spawn('node', ['scripts/print-agent.mjs'], {
      env: {
        ...process.env,
        PORT: String(PORT),
        PRINT_COMMAND: `cat > "${outFile}"`, // stands in for `lp -d QUEUE -o raw`
        ALLOWED_ORIGINS: GOOD_ORIGIN,
      },
      stdio: 'ignore',
    });
    await waitForAgent();
  });

  afterAll(() => {
    agent?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers the health check', async () => {
    const r = await fetch(`${BASE}/health`, { headers: { Origin: GOOD_ORIGIN } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    expect(r.headers.get('access-control-allow-origin')).toBe(GOOD_ORIGIN);
  });

  it('answers the browser preflight, including Chrome local-network permission', async () => {
    const r = await fetch(`${BASE}/print`, {
      method: 'OPTIONS',
      headers: {
        Origin: GOOD_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe(GOOD_ORIGIN);
    expect(r.headers.get('access-control-allow-private-network')).toBe('true');
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('refuses other websites', async () => {
    const preflight = await fetch(`${BASE}/print`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.org', 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.status).toBe(403);
    const post = await fetch(`${BASE}/print`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example.org', 'Content-Type': 'application/octet-stream' },
      body: invoiceBytes(),
    });
    expect(post.status).toBe(403);
    expect(existsSync(outFile)).toBe(false);
    const noOrigin = await fetch(`${BASE}/print`, { method: 'POST', body: invoiceBytes() });
    expect(noOrigin.status).toBe(403);
  });

  it('rejects data that is not an ESC/P invoice', async () => {
    const r = await fetch(`${BASE}/print`, {
      method: 'POST',
      headers: { Origin: GOOD_ORIGIN, 'Content-Type': 'application/octet-stream' },
      body: 'just some text',
    });
    expect(r.status).toBe(400);
    expect(existsSync(outFile)).toBe(false);
  });

  it('rejects oversized jobs', async () => {
    const big = new Uint8Array(300 * 1024);
    big[0] = ESC;
    big[1] = 0x40;
    const r = await fetch(`${BASE}/print`, {
      method: 'POST',
      headers: { Origin: GOOD_ORIGIN, 'Content-Type': 'application/octet-stream' },
      body: big,
    }).catch(() => null);
    // Either a clean 413 or the connection is closed early; never a successful print
    if (r) expect(r.status).toBe(413);
    expect(existsSync(outFile)).toBe(false);
  });

  it('hands the bytes to the printer command unchanged', async () => {
    const bytes = invoiceBytes();
    const r = await fetch(`${BASE}/print`, {
      method: 'POST',
      headers: { Origin: GOOD_ORIGIN, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    expect(Array.from(readFileSync(outFile))).toEqual(Array.from(bytes));
  });
});
