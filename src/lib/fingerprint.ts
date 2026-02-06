/**
 * Generate a browser fingerprint for anonymous user identification.
 * This is stored in localStorage and used as user_id when auth is disabled.
 */

const FINGERPRINT_KEY = 'chat-skills-fingerprint';

// Simple hash function
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Generate fingerprint from browser properties
function generateFingerprint(): string {
  const components: string[] = [];

  // Screen properties
  components.push(`${screen.width}x${screen.height}`);
  components.push(`${screen.colorDepth}`);
  components.push(`${screen.pixelDepth}`);

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Language
  components.push(navigator.language);

  // Platform
  components.push(navigator.platform);

  // User agent
  components.push(navigator.userAgent);

  // Hardware concurrency
  components.push(`${navigator.hardwareConcurrency || 0}`);

  // Device memory (if available)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components.push(`${(navigator as any).deviceMemory || 0}`);

  // Random component for uniqueness (stored once)
  const randomPart = Math.random().toString(36).substring(2, 15);

  const fingerprintData = components.join('|') + '|' + randomPart;
  return 'fp_' + simpleHash(fingerprintData) + '_' + randomPart.substring(0, 8);
}

/**
 * Get or create a fingerprint ID for the current browser.
 * Returns the same ID across sessions using localStorage.
 */
export function getFingerprint(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  // Check if we already have a fingerprint
  let fingerprint = localStorage.getItem(FINGERPRINT_KEY);

  if (!fingerprint) {
    fingerprint = generateFingerprint();
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }

  return fingerprint;
}

/**
 * Clear the stored fingerprint (useful for testing)
 */
export function clearFingerprint(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(FINGERPRINT_KEY);
  }
}
