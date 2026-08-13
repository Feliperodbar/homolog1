import { RESTRICTED_HOSTNAMES, RESTRICTED_URL_PATTERNS } from './constants';

export interface RestrictionInfo {
  restricted: boolean;
  reason?: 'internal' | 'webstore';
  pattern?: RegExp;
  hostname?: string;
}

export function isRestrictedUrl(url: string | null | undefined): RestrictionInfo {
  if (!url || typeof url !== 'string') {
    return { restricted: true, reason: 'internal' };
  }
  for (const pattern of RESTRICTED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return { restricted: true, reason: 'internal', pattern };
    }
  }
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const h of RESTRICTED_HOSTNAMES) {
      if (host === h || host.endsWith(`.${h}`)) {
        return { restricted: true, reason: 'webstore', hostname: h };
      }
    }
  } catch {
    return { restricted: true, reason: 'internal' };
  }
  return { restricted: false };
}
