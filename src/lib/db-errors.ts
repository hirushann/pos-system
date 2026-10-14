export type DbErrorKind = 'unique' | 'check' | 'foreign_key';

interface MySqlLikeError {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  cause?: MySqlLikeError;
}

/**
 * Classifies a MySQL/MariaDB driver error. Drizzle wraps driver errors in a
 * DrizzleQueryError whose `cause` holds the original mysql2 error, so we look
 * at both levels.
 * - ER_DUP_ENTRY (1062): unique constraint violation
 * - ER_CHECK_CONSTRAINT_VIOLATED (3819, MariaDB 4025): check constraint violation
 * - ER_NO_REFERENCED_ROW_2 (1452) / ER_ROW_IS_REFERENCED_2 (1451): foreign key violation
 */
export function getDbErrorKind(err: unknown): DbErrorKind | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as MySqlLikeError;
  for (const candidate of [e, e.cause]) {
    if (!candidate) continue;
    const { code, errno } = candidate;
    if (code === 'ER_DUP_ENTRY' || errno === 1062) return 'unique';
    if (
      code === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
      code === 'ER_CONSTRAINT_FAILED' ||
      errno === 3819 ||
      errno === 4025
    ) {
      return 'check';
    }
    if (
      code === 'ER_NO_REFERENCED_ROW_2' ||
      code === 'ER_ROW_IS_REFERENCED_2' ||
      errno === 1451 ||
      errno === 1452
    ) {
      return 'foreign_key';
    }
  }
  return null;
}

/** Standardized database error mapping for MySQL error codes. */
export function mapDatabaseError(
  err: unknown,
  fallbackMessage = 'An unexpected database error occurred.',
): string {
  const kind = getDbErrorKind(err);

  if (kind === 'unique') {
    return 'A record with these unique details already exists.';
  }

  if (kind === 'check') {
    return 'The operation failed because the submitted data violated a database validation constraint check.';
  }

  if (kind === 'foreign_key') {
    return 'The operation failed because a referenced entity (such as a category, product, or user) does not exist.';
  }

  if (typeof err === 'object' && err !== null) {
    const message = (err as MySqlLikeError).message;
    if (message) return message;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return fallbackMessage;
}
