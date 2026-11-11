import * as Minio from "minio";
import got from "got";
import { BROWSER_UA, createStickySession } from "@/utils/browser";
import { isProxyEnabled } from "@/utils/proxy";
import { rewriteManifest } from "@/utils/m3u8";
import type { AnyProxyAgent } from "@/types/proxy";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "localhost";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000", 10);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";
const MINIO_ROOT_USER =
  process.env.MINIO_ROOT_USER ||
  process.env.MINIO_ACCESS_KEY ||
  "minioadmin";
const MINIO_ROOT_PASSWORD =
  process.env.MINIO_ROOT_PASSWORD ||
  process.env.MINIO_SECRET_KEY ||
  "minioadminpassword";

export const MINIO_BUCKET_NAME =
  process.env.MINIO_BUCKET_NAME ||
  process.env.MINIO_BUCKET ||
  "movies";

let minioClientInstance: Minio.Client | null = null;
let isBucketEnsured = false;

export function getMinioClient(): Minio.Client {
  if (!minioClientInstance) {
    minioClientInstance = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ROOT_USER,
      secretKey: MINIO_ROOT_PASSWORD,
    });
  }
  return minioClientInstance;
}

export function normalizeMoviePath(rawPath: string): string {
  if (!rawPath) return "";
  let cleaned = rawPath.trim();

  // If a full or relative proxy URL is passed (e.g. /api/video/m3u8?path=serie/foo&url=...), extract the path param
  if (cleaned.includes("path=")) {
    try {
      const dummyUrl = cleaned.startsWith("http")
        ? new URL(cleaned)
        : new URL(`http://localhost${cleaned.startsWith("/") ? "" : "/"}${cleaned}`);
      const extractedPath = dummyUrl.searchParams.get("path");
      if (extractedPath) {
        cleaned = extractedPath;
      }
    } catch (_) {
      const match = cleaned.match(/[?&]path=([^&]+)/);
      if (match) {
        cleaned = match[1];
      }
    }
  }

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (_) {}

  // Remove query string and hash
  cleaned = cleaned.split("?")[0].split("#")[0];
  // Remove full domain/protocol if present (e.g. https://sololatino.net/...)
  cleaned = cleaned.replace(/^https?:\/\/[^/]+\//i, "");
  // Remove leading and trailing slashes
  cleaned = cleaned.replace(/^\/+/, "").replace(/\/+$/, "");
  // Remove movies/ bucket prefix if present
  cleaned = cleaned.replace(/^movies\//i, "");
  // Remove .m3u8 or index.m3u8 if present at the end
  cleaned = cleaned.replace(/\/index\.m3u8$/i, "").replace(/\.m3u8$/i, "");
  return cleaned;
}

export function getPublicBaseUrl(): string {
  if (process.env.MINIO_PUBLIC_URL) {
    return process.env.MINIO_PUBLIC_URL.replace(/\/+$/, "");
  }
  const protocol = MINIO_USE_SSL ? "https" : "http";
  return `${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}`;
}

export async function ensureMoviesBucket(): Promise<void> {
  if (isBucketEnsured) return;

  const client = getMinioClient();
  try {
    const exists = await client.bucketExists(MINIO_BUCKET_NAME);
    if (!exists) {
      await client.makeBucket(MINIO_BUCKET_NAME);

      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${MINIO_BUCKET_NAME}/*`],
          },
        ],
      };

      await client.setBucketPolicy(MINIO_BUCKET_NAME, JSON.stringify(policy));
    }
    isBucketEnsured = true;
  } catch (error) {
    console.warn(`[MinIO] Failed to ensure bucket "${MINIO_BUCKET_NAME}":`, error);
  }
}

export async function hasManifest(path: string): Promise<boolean> {
  const cleanPath = normalizeMoviePath(path);
  if (!cleanPath) return false;

  const client = getMinioClient();
  const candidateKeys = [
    `${cleanPath}/index.m3u8`,
    `${cleanPath}.m3u8`,
    cleanPath,
    `movies/${cleanPath}/index.m3u8`,
    `movies/${cleanPath}.m3u8`,
  ];

  for (const objectKey of candidateKeys) {
    try {
      await client.statObject(MINIO_BUCKET_NAME, objectKey);
      return true;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === "NotFound" || error?.code === "NoSuchKey") {
        continue;
      }
      console.warn(`[MinIO] statObject warning for ${objectKey}:`, err);
    }
  }

  return false;
}

export function getManifestAppUrl(path: string): string {
  const cleanPath = normalizeMoviePath(path);
  return `/api/video/m3u8?path=${encodeURIComponent(cleanPath)}`;
}

export function getManifestPublicUrl(path: string): string {
  return getManifestAppUrl(path);
}

export async function getManifest(path: string): Promise<string | null> {
  const cleanPath = normalizeMoviePath(path);
  if (!cleanPath) return null;

  const client = getMinioClient();
  const candidateKeys = [
    `${cleanPath}/index.m3u8`,
    `${cleanPath}.m3u8`,
    cleanPath,
    `movies/${cleanPath}/index.m3u8`,
    `movies/${cleanPath}.m3u8`,
  ];

  for (const objectKey of candidateKeys) {
    try {
      const stream = await client.getObject(MINIO_BUCKET_NAME, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString("utf-8");
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === "NotFound" || error?.code === "NoSuchKey") {
        continue;
      }
      console.warn(`[MinIO] getManifest error for ${objectKey}:`, err);
    }
  }

  return null;
}

export async function saveManifest(
  path: string,
  content: string,
): Promise<string> {
  await ensureMoviesBucket();
  const cleanPath = normalizeMoviePath(path);
  const objectKey = `${cleanPath}/index.m3u8`;
  const buffer = Buffer.from(content, "utf-8");

  const client = getMinioClient();
  await client.putObject(
    MINIO_BUCKET_NAME,
    objectKey,
    buffer,
    buffer.length,
    {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "public, max-age=86400",
    },
  );

  return getManifestAppUrl(path);
}

export interface SaveManifestOptions {
  baseOrigin?: string;
  agent?: AnyProxyAgent;
  headers?: Record<string, string>;
  referer?: string;
}

export async function saveManifestFromUpstream(
  path: string,
  manifestUrl: string,
  options?: SaveManifestOptions | string,
): Promise<string> {
  const opts: SaveManifestOptions =
    typeof options === "string" ? { baseOrigin: options } : options || {};

  const effectiveAgent =
    opts.agent ||
    (isProxyEnabled() ? createStickySession().agent : undefined);

  const requestHeaders: Record<string, string> = {
    "user-agent": BROWSER_UA,
    ...(opts.referer ? { referer: opts.referer } : {}),
    ...(opts.headers || {}),
  };

  const manifestRes = await got(manifestUrl, {
    headers: requestHeaders,
    throwHttpErrors: false,
    ...(effectiveAgent
      ? { agent: { https: effectiveAgent as never, http: effectiveAgent as never } }
      : {}),
  });

  if (manifestRes.statusCode >= 400) {
    throw new Error(
      `Upstream manifest returned HTTP ${manifestRes.statusCode}`,
    );
  }

  const origin =
    opts.baseOrigin ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  const rewritten = rewriteManifest(manifestRes.body, manifestUrl, origin);
  return await saveManifest(path, rewritten);
}
