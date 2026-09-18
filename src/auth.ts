import type { Env } from './types';

// ────────────────────────────────────────────────────────────
// 密碼雜湊（PBKDF2-HMAC-SHA256，全用 Web Crypto，可在 Workers 執行）
// 儲存格式：pbkdf2$<iterations>$<saltBase64>$<hashBase64>
// ────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = unb64(parts[2]);
  const expected = unb64(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

// ────────────────────────────────────────────────────────────
// Session：HMAC-SHA256 簽章的無狀態 token（放在 cookie）
// 格式：<payloadB64url>.<sigB64url>，payload = {uid, exp}
// ────────────────────────────────────────────────────────────
export interface Session {
  uid: number;
  exp: number; // unix 秒
}

const WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function signSession(env: Env, uid: number, ttl = WEEK_SECONDS): Promise<string> {
  const payload: Session = { uid, exp: Math.floor(Date.now() / 1000) + ttl };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(sessionSecret(env), body);
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(env: Env, token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(sessionSecret(env), body);
  if (!timingSafeEqual(unb64url(sig), expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as Session;
    if (typeof payload.uid !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_TTL = WEEK_SECONDS;

function sessionSecret(env: Env): string {
  return env.SESSION_SECRET || env.DASHBOARD_PASS || 'dev-insecure-secret';
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

// ────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return unb64(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}
