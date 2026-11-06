import * as Minio from "minio";
import got from "got";
import { BROWSER_UA, createStickySession } from "@/utils/browser";
import { isProxyEnabled } from "@/utils/proxy";
import { rewriteManifest } from "@/utils/m3u8";

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
  const withoutQuery = rawPath.split("?")[0].split("#")[0];
  return withoutQuery.replace(/^\/+/, "").replace(/\/+$/, "");
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

  const objectKey = `${cleanPath}/index.m3u8`;
  const client = getMinioClient();

  try {
    await client.statObject(MINIO_BUCKET_NAME, objectKey);
    return true;
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error?.code === "NotFound" || error?.code === "NoSuchKey") {
      return false;
    }
    console.warn(`[MinIO] statObject warning for ${objectKey}:`, err);
    return false;
  }
}

export function getManifestPublicUrl(path: string): string {
  const cleanPath = normalizeMoviePath(path);
  const objectKey = `${cleanPath}/index.m3u8`;
  return `${getPublicBaseUrl()}/${MINIO_BUCKET_NAME}/${objectKey}`;
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

  return getManifestPublicUrl(path);
}

export async function saveManifestFromUpstream(
  path: string,
  manifestUrl: string,
  baseOrigin?: string,
): Promise<string> {
  const { agent } = isProxyEnabled()
    ? createStickySession()
    : { agent: undefined };

  const manifestRes = await got(manifestUrl, {
    headers: { "user-agent": BROWSER_UA },
    throwHttpErrors: false,
    ...(agent ? { agent: { https: agent, http: agent } } : {}),
  });

  if (manifestRes.statusCode >= 400) {
    throw new Error(
      `Upstream manifest returned HTTP ${manifestRes.statusCode}`,
    );
  }

  const origin = baseOrigin || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const rewritten = rewriteManifest(manifestRes.body, manifestUrl, origin);
  return await saveManifest(path, rewritten);
}
