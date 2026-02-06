import { auth } from './auth';
import { isAuthEnabled } from './auth.config';

/**
 * Get the user ID from either session (when auth enabled) or fingerprint header (when disabled).
 * Returns null if no valid user identification is found.
 */
export async function getUserId(request?: Request): Promise<string | null> {
  if (isAuthEnabled) {
    // Auth enabled - get user from session
    const session = await auth();
    return session?.user?.id || null;
  } else {
    // Auth disabled - get fingerprint from header
    if (request) {
      const fingerprintId = request.headers.get('X-Fingerprint-ID');
      return fingerprintId || null;
    }
    return null;
  }
}

/**
 * Check if auth is enabled
 */
export { isAuthEnabled };
