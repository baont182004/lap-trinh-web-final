const isProduction = process.env.NODE_ENV === 'production';
const isCrossSite = process.env.CROSS_SITE_COOKIES === 'true';

function parseDurationMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  if (/^\d+$/.test(value)) return Number(value);

  const match = String(value).match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] || 1);
}

const accessMaxAgeMs = parseDurationMs(
  process.env.ACCESS_TOKEN_TTL,
  15 * 60 * 1000
);
const refreshMaxAgeMs = parseDurationMs(
  process.env.REFRESH_TOKEN_TTL,
  30 * 24 * 60 * 60 * 1000
);

export function getAccessCookieOptions() {
  return {
    httpOnly: true,
    secure: isCrossSite || isProduction,
    sameSite: isCrossSite ? 'none' : 'lax',
    path: '/',
    maxAge: accessMaxAgeMs,
  };
}

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isCrossSite || isProduction,
    sameSite: isCrossSite ? 'none' : 'lax',
    path: '/api/auth/refresh',
    maxAge: refreshMaxAgeMs,
  };
}

export function getCsrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isCrossSite || isProduction,
    sameSite: isCrossSite ? 'none' : 'lax',
    path: '/',
  };
}
