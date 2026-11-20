import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { v1ErrorResponse, type V1ErrorPayload } from "@/utils/api-v1";

export const PB_AUTH_CACHE_TTL_MS = 30_000;
const PB_AUTH_CACHE_MAX_ENTRIES = 1_000;
const PB_AUTH_TIMEOUT_MS = 10_000;
const DEFAULT_POCKETBASE_URL = "http://127.0.0.1:8090";

interface CachedTokenEntry {
  pbUrl: string;
  expiresAt: number;
}

export interface PbAuthOptions {
  fetchFn?: typeof fetch;
  pbUrl?: string;
  now?: number;
  ttlMs?: number;
}

export type V1AuthResult =
  | { ok: true; token: string }
  | { ok: false; response: NextResponse<V1ErrorPayload> };

const tokenValidationCache = new Map<string, CachedTokenEntry>();

export function clearPbAuthCache(): void {
  tokenValidationCache.clear();
}

export function resolvePocketBaseUrl(explicitUrl?: string): string {
  // Read dynamically via non-constant key so Turbopack/Next.js build-time inlining
  // does not ignore runtime NEXT_PUBLIC_POCKETBASE_URL / POCKETBASE_URL overrides.
  const publicEnvKey = ["NEXT", "PUBLIC", "POCKETBASE", "URL"].join("_");
  const runtimePublicUrl = Reflect.get(process.env, publicEnvKey) as
    | string
    | undefined;
  const runtimeUrl = process.env.POCKETBASE_URL ?? runtimePublicUrl;
  const raw =
    explicitUrl ??
    runtimeUrl ??
    process.env.NEXT_PUBLIC_POCKETBASE_URL ??
    DEFAULT_POCKETBASE_URL;
  return raw.trim().replace(/\/+$/, "") || DEFAULT_POCKETBASE_URL;
}

export function hashPbToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseTokenFromPbAuthCookie(rawValue: string): string | null {
  const candidates: string[] = [rawValue];
  try {
    const decoded = decodeURIComponent(rawValue);
    if (decoded !== rawValue) {
      candidates.push(decoded);
    }
  } catch {
    // Ignore malformed URI sequences and try raw cookie value
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { token?: unknown };
      if (typeof parsed?.token === "string" && parsed.token.trim().length > 0) {
        return parsed.token.trim();
      }
    } catch {
      // Try next candidate representation
    }
  }

  return null;
}

export function extractPbToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  const pbAuthCookie = request.cookies.get("pb_auth")?.value;
  if (pbAuthCookie && pbAuthCookie.trim().length > 0) {
    return parseTokenFromPbAuthCookie(pbAuthCookie);
  }

  return null;
}

function pruneCacheIfNeeded(now: number): void {
  if (tokenValidationCache.size < PB_AUTH_CACHE_MAX_ENTRIES) return;

  for (const [key, entry] of tokenValidationCache.entries()) {
    if (entry.expiresAt <= now) {
      tokenValidationCache.delete(key);
    }
  }

  while (tokenValidationCache.size >= PB_AUTH_CACHE_MAX_ENTRIES) {
    const oldestKey = tokenValidationCache.keys().next().value;
    if (!oldestKey) break;
    tokenValidationCache.delete(oldestKey);
  }
}

export async function verifyPbToken(
  token: string,
  options: PbAuthOptions = {},
): Promise<boolean> {
  const trimmedToken = token.trim();
  if (!trimmedToken) return false;

  const pbUrl = resolvePocketBaseUrl(options.pbUrl);
  const now = options.now ?? Date.now();
  const ttlMs = Math.min(options.ttlMs ?? PB_AUTH_CACHE_TTL_MS, PB_AUTH_CACHE_TTL_MS);
  const tokenHash = hashPbToken(trimmedToken);

  const cached = tokenValidationCache.get(tokenHash);
  if (cached && cached.pbUrl === pbUrl && cached.expiresAt > now) {
    return true;
  }

  const fetchFn = options.fetchFn ?? fetch;

  try {
    const response = await fetchFn(`${pbUrl}/api/collections/users/auth-refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PB_AUTH_TIMEOUT_MS),
    });

    const isOk = response.ok;
    await response.body?.cancel().catch(() => {});

    if (isOk) {
      if (ttlMs > 0) {
        pruneCacheIfNeeded(now);
        tokenValidationCache.set(tokenHash, {
          pbUrl,
          expiresAt: now + ttlMs,
        });
      }
      return true;
    }

    tokenValidationCache.delete(tokenHash);
    return false;
  } catch (err) {
    console.error("[API v1 Auth] Error validando sesión de PocketBase:", err);
    tokenValidationCache.delete(tokenHash);
    return false;
  }
}

export async function requireV1Auth(
  request: NextRequest,
  options: PbAuthOptions = {},
): Promise<V1AuthResult> {
  const token = extractPbToken(request);
  if (!token) {
    return {
      ok: false,
      response: v1ErrorResponse(
        401,
        "UNAUTHORIZED",
        "Sesión de PocketBase ausente o inválida",
      ),
    };
  }

  const isValid = await verifyPbToken(token, options);
  if (!isValid) {
    return {
      ok: false,
      response: v1ErrorResponse(
        401,
        "UNAUTHORIZED",
        "Sesión de PocketBase inválida o expirada",
      ),
    };
  }

  return { ok: true, token };
}
