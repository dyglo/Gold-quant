export const REFRESH_MAX_AGE = 60 * 60 * 24 * 400;

export function sessionCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function accessLifetime(expiresIn: number) {
  return Math.min(3600, Math.max(1, Math.floor(expiresIn || 3600)));
}

export function validRefreshToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9._-]{1,4096}$/.test(token);
}

// Decoding only schedules renewal. Authorization still verifies with Supabase.
export function needsRefresh(token: string | undefined) {
  if (!token) return true;
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return typeof exp !== 'number' || exp <= Date.now() / 1000 + 60;
  } catch { return true; }
}
