import type { OAuthScopeState } from './types';
import { OAUTH_SCOPES } from './permissions';

const STORAGE_PREFIX = 'vep_oauth_scopes_';

function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function loadGrantedScopes(uid: string): OAuthScopeState[] {
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return OAUTH_SCOPES.map((def) => ({
        ...def,
        granted: parsed[def.id] ?? false,
      }));
    }
  } catch {
    // corrupted storage, fall through to defaults
  }
  return OAUTH_SCOPES.map((def) => ({ ...def, granted: false }));
}

export function saveGrantedScopes(uid: string, scopes: OAuthScopeState[]): void {
  const map: Record<string, boolean> = {};
  for (const s of scopes) {
    map[s.id] = s.granted;
  }
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(map));
  } catch {
    // storage full or unavailable
  }
}

export function clearGrantedScopes(uid: string): void {
  try {
    localStorage.removeItem(getStorageKey(uid));
  } catch {
    // ignore
  }
}

export function getScopesToRequest(scopes: OAuthScopeState[]): string[] {
  return scopes.filter((s) => !s.granted && s.scope).map((s) => s.scope);
}

export function getGrantedCount(scopes: OAuthScopeState[]): number {
  return scopes.filter((s) => s.granted).length;
}

export function isGoogleGISAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).google?.accounts?.oauth2;
}

export async function requestAdditionalScope(
  scope: string,
): Promise<boolean> {
  if (!isGoogleGISAvailable()) {
    console.warn('Google Identity Services not loaded');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const google = (window as any).google;
      const client = google.accounts.oauth2.initTokenClient({
        client_id: '811711024905', // from firebase config
        scope,
        callback: (response: any) => {
          if (response.error) {
            console.error('OAuth scope request failed:', response.error);
            resolve(false);
          } else {
            resolve(true);
          }
        },
      });
      client.requestAccessToken({ prompt: '' });
    } catch (err) {
      console.error('OAuth scope request error:', err);
      resolve(false);
    }
  });
}

export async function requestAllScopes(scopes: OAuthScopeState[]): Promise<OAuthScopeState[]> {
  const missing = getScopesToRequest(scopes);
  if (missing.length === 0) return scopes;

  // Request in batches to avoid overwhelming the popup flow
  const updated = [...scopes];
  for (const scope of missing) {
    const granted = await requestAdditionalScope(scope);
    if (granted) {
      const idx = updated.findIndex((s) => s.scope === scope);
      if (idx !== -1) updated[idx] = { ...updated[idx], granted: true };
    }
  }

  return updated;
}

export function getOAuthCategories(scopes: OAuthScopeState[]): string[] {
  return [...new Set(scopes.map((s) => s.category))];
}
