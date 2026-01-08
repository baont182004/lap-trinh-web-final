import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function signAccessToken(userId) {
  const secret = requireEnv('ACCESS_TOKEN_SECRET');
  const expiresIn = process.env.ACCESS_TOKEN_TTL || '15m';

  return jwt.sign({}, secret, {
    subject: String(userId),
    expiresIn,
  });
}

export function signRefreshToken(userId, family) {
  const secret = requireEnv('REFRESH_TOKEN_SECRET');
  const expiresIn = process.env.REFRESH_TOKEN_TTL || '30d';

  return jwt.sign({ family }, secret, {
    subject: String(userId),
    jwtid: randomUUID(),
    expiresIn,
  });
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
