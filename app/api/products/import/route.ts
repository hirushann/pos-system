import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/src/lib/auth-guards';
import { commitProductImport, previewProductImport } from '@/src/data/product-import';
import { mapDatabaseError } from '@/src/lib/db-errors';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Owner only. multipart form: file (CSV), mode ("preview" shows what would happen and
 * writes nothing; "commit" imports), skipInvalid ("1" = leave out rows with errors).
 */
export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx || ctx.user.role !== 'owner' || ctx.user.banned) {
    return NextResponse.json({ ok: false, error: 'Store owner access required.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not read the upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Choose a CSV file first.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: 'The file is larger than 2 MB. Split it into smaller files.' }, { status: 413 });
  }

  const text = await file.text();
  const mode = form.get('mode') === 'commit' ? 'commit' : 'preview';

  try {
    if (mode === 'preview') {
      return NextResponse.json({ ok: true, preview: await previewProductImport(text) });
    }

    const outcome = await commitProductImport(text, ctx.user.id, {
      skipInvalid: form.get('skipInvalid') === '1',
    });
    if (!outcome.ok) {
      return NextResponse.json(outcome, { status: 422 });
    }

    for (const path of ['/products', '/inventory', '/checkout', '/labels']) revalidatePath(path);
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: mapDatabaseError(err, 'The import failed and nothing was saved.') },
      { status: 500 },
    );
  }
}
