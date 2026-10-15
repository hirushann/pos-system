/**
 * Browser side of the print agent (scripts/print-agent.mjs), which runs on the shop
 * computer and passes ESC/P invoice bytes to the dot-matrix printer unchanged.
 */
export const PRINT_AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:9101';

/** True when the print agent is running and allows this website. */
export async function checkPrintAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendToPrintAgent(bytes: Uint8Array): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error || `Print agent answered ${res.status}` };
  } catch {
    return { ok: false, error: 'Could not reach the print agent on this computer.' };
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
