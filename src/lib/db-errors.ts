/**
 * Standardized database error mapping for PostgreSQL error codes.
 * - 23505: Unique constraint violation
 * - 23514: Check constraint violation
 * - 23503: Foreign key violation
 */
export function mapDatabaseError(
  err: unknown,
  fallbackMessage = 'An unexpected database error occurred.',
): string {
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as {
      code?: string;
      detail?: string;
      message?: string;
      constraint?: string;
      cause?: { code?: string; detail?: string; message?: string };
    };

    const code = errorObj.code || errorObj.cause?.code;
    const detail = errorObj.detail || errorObj.cause?.detail;

    if (code === '23505') {
      if (detail) {
        return `A duplicate record was detected: ${detail}`;
      }
      return 'A record with these unique details already exists.';
    }

    if (code === '23514') {
      return 'The operation failed because the submitted data violated a database validation constraint check.';
    }

    if (code === '23503') {
      return 'The operation failed because a referenced entity (such as a category, product, or user) does not exist.';
    }

    if (errorObj.message) {
      return errorObj.message;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  return fallbackMessage;
}
