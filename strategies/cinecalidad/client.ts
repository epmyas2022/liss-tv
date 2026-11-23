export const CINECALIDAD_BASE_URL = "https://www.cinecalidad.am";

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15000;

export class CinecalidadError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "CinecalidadError";
    this.status = status;
  }
}

export async function cinecalidadFetch(
  endpointOrUrl: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = endpointOrUrl.startsWith("http")
    ? endpointOrUrl
    : `${CINECALIDAD_BASE_URL}${endpointOrUrl.startsWith("/") ? "" : "/"}${endpointOrUrl}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
        Referer: `${CINECALIDAD_BASE_URL}/`,
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      throw new CinecalidadError(
        `[Cinecalidad] Request failed with status ${res.status} for ${url}`,
        res.status,
      );
    }

    return res;
  } catch (err) {
    if (err instanceof CinecalidadError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new CinecalidadError(`[Cinecalidad] Network error for ${url}: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
