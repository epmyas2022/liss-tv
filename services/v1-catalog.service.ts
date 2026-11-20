import { DriverRegistry } from "@/drivers/registry";
import { findProviderBySlugOrLink, get, getAny } from "@/services/movie.store";
import type { GetUrlOptions, MovieDriver, StoredMovie } from "@/types/movie";
import { inferProviderFromLink } from "@/utils/utils";
import {
  asNonEmptyString,
  isPlainObject,
  V1ApiError,
  type V1CatalogResponse,
  type V1MediaDetail,
  type V1MediaItem,
  type V1ProviderInfo,
  type V1ProvidersResponse,
  type V1StreamResponse,
} from "@/utils/api-v1";

export const DEFAULT_PROVIDER_ID = "megadede";
export const PROVIDER_COOKIE_NAME = "liss_provider";
const DEFAULT_STREAM_TIMEOUT_MS = 60_000;
const DEFAULT_STREAM_ATTEMPTS = 3;
const DEFAULT_STREAM_RETRY_DELAY_MS = 1_000;

interface ProviderCapabilityConfig {
  enabled: boolean;
  disabledReason: string | null;
  supportsMovies: boolean;
  supportsSeries: boolean;
}

const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilityConfig> = {
  "solo-latino": {
    enabled: false,
    disabledReason: "Deshabilitado",
    supportsMovies: true,
    supportsSeries: true,
  },
  serieslan: {
    enabled: true,
    disabledReason: null,
    supportsMovies: false,
    supportsSeries: true,
  },
};

const DEFAULT_CAPABILITY: ProviderCapabilityConfig = {
  enabled: true,
  disabledReason: null,
  supportsMovies: true,
  supportsSeries: true,
};

export interface V1CatalogDeps {
  getAvailableProviders?: () => { id: string; name: string }[];
  resolveDriver?: (providerId?: string) => MovieDriver;
  getStored?: typeof get;
  getAnyStored?: typeof getAny;
  findProviderByLink?: typeof findProviderBySlugOrLink;
  inferProvider?: typeof inferProviderFromLink;
  streamTimeoutMs?: number;
  streamAttempts?: number;
  streamRetryDelayMs?: number;
}

function getDefaultDeps(): Required<V1CatalogDeps> {
  return {
    getAvailableProviders: () => DriverRegistry.getAvailableProviders(),
    resolveDriver: (providerId?: string) => DriverRegistry.resolveDriverForContent(providerId),
    getStored: get,
    getAnyStored: getAny,
    findProviderByLink: findProviderBySlugOrLink,
    inferProvider: inferProviderFromLink,
    streamTimeoutMs: DEFAULT_STREAM_TIMEOUT_MS,
    streamAttempts: DEFAULT_STREAM_ATTEMPTS,
    streamRetryDelayMs: DEFAULT_STREAM_RETRY_DELAY_MS,
  };
}

function normalizeLegacyProviderId(providerId: string | undefined): string | undefined {
  if (!providerId) return undefined;
  const trimmed = providerId.trim();
  if (!trimmed) return undefined;
  if (trimmed === "sololatino") return "solo-latino";
  return trimmed;
}

export function buildProviderInfoList(
  available: { id: string; name: string }[],
): V1ProviderInfo[] {
  return available.map((provider) => {
    const caps = PROVIDER_CAPABILITIES[provider.id] ?? DEFAULT_CAPABILITY;
    return {
      id: provider.id,
      name: provider.name,
      enabled: caps.enabled,
      disabledReason: caps.disabledReason,
      supportsMovies: caps.supportsMovies,
      supportsSeries: caps.supportsSeries,
    };
  });
}

export function resolveActiveProvider(
  providers: V1ProviderInfo[],
  cookieProvider?: string,
): string {
  const normalizedCookie = normalizeLegacyProviderId(cookieProvider);
  if (
    normalizedCookie &&
    providers.some((p) => p.id === normalizedCookie && p.enabled)
  ) {
    return normalizedCookie;
  }

  const defaultEnabled = providers.find(
    (p) => p.id === DEFAULT_PROVIDER_ID && p.enabled,
  );
  if (defaultEnabled) return defaultEnabled.id;

  const firstEnabled = providers.find((p) => p.enabled);
  return firstEnabled?.id ?? DEFAULT_PROVIDER_ID;
}

export function getProvidersPayload(
  cookieProvider?: string,
  deps: V1CatalogDeps = {},
): V1ProvidersResponse {
  const resolved = { ...getDefaultDeps(), ...deps };
  const providers = buildProviderInfoList(resolved.getAvailableProviders());
  const activeProvider = resolveActiveProvider(providers, cookieProvider);
  return {
    activeProvider,
    providers,
  };
}

function assertKnownProviderIfExplicit(
  explicitProvider: string | undefined,
  providers: V1ProviderInfo[],
): string | undefined {
  const normalized = normalizeLegacyProviderId(explicitProvider);
  if (!normalized) return undefined;
  const matched = providers.find((p) => p.id === normalized);
  if (!matched) {
    throw new V1ApiError(
      404,
      "NOT_FOUND",
      `Proveedor no encontrado: ${normalized}`,
    );
  }
  return matched.id;
}

function normalizeCatalogFilter(
  providerId: string,
  filter?: string,
  search?: string,
): string | undefined {
  if (search) return undefined;
  const trimmed = filter?.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower === "home") return undefined;

  if (
    providerId === "serieslan" &&
    (lower === "peliculas" ||
      lower === "movies" ||
      lower === "movie" ||
      lower === "pelicula")
  ) {
    return "movies";
  }

  if (
    providerId === "gnula" &&
    (lower === "movies" || lower === "movie" || lower === "pelicula")
  ) {
    return "peliculas";
  }

  return trimmed;
}

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function coerceNullableString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function coercePlainContext(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function mapMediaItem(item: {
  id?: unknown;
  link: unknown;
  image?: unknown;
  rating?: unknown;
  title?: unknown;
  year?: unknown;
  type?: unknown;
  provider?: unknown;
  context?: unknown;
}, fallbackProvider: string): V1MediaItem {
  const itemProvider = asNonEmptyString(item.provider);
  return {
    id: coerceNullableString(item.id),
    link: coerceString(item.link),
    image: coerceString(item.image),
    rating: coerceString(item.rating),
    title: coerceString(item.title),
    year: coerceString(item.year),
    type: item.type === "movie" || item.type === "serie" ? item.type : null,
    provider: itemProvider || fallbackProvider,
    context: coercePlainContext(item.context),
  };
}

function extractHttpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.message === "string") {
    const match = record.message.match(/\b(?:with status|HTTP(?: status)?)\s+(\d{3})\b/i);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export async function getCatalogPayload(
  params: {
    provider?: string;
    filter?: string;
    search?: string;
    page: number;
    cookieProvider?: string;
  },
  deps: V1CatalogDeps = {},
): Promise<V1CatalogResponse> {
  const resolved = { ...getDefaultDeps(), ...deps };
  const providers = buildProviderInfoList(resolved.getAvailableProviders());
  const explicitProvider = assertKnownProviderIfExplicit(
    asNonEmptyString(params.provider),
    providers,
  );
  const providerId =
    explicitProvider ?? resolveActiveProvider(providers, params.cookieProvider);

  const normalizedSearch = asNonEmptyString(params.search);
  const normalizedFilter = normalizeCatalogFilter(
    providerId,
    params.filter,
    normalizedSearch,
  );

  const driver = resolved.resolveDriver(providerId);

  let result;
  try {
    result = await driver.getAll({
      search: normalizedSearch,
      slug: normalizedFilter,
      pageNumber: params.page,
    });
  } catch (err) {
    const status = extractHttpStatus(err);
    if (status === 404) {
      throw new V1ApiError(404, "NOT_FOUND", "Catálogo no encontrado");
    }
    const message =
      err instanceof Error && err.message
        ? err.message
        : `Error al consultar el catálogo en ${providerId}`;
    throw new V1ApiError(502, "UPSTREAM_ERROR", message);
  }

  if (!result) {
    throw new V1ApiError(
      502,
      "UPSTREAM_ERROR",
      `El proveedor ${providerId} no respondió al consultar el catálogo`,
    );
  }

  const lastPageNumber = result.lastPageNumber ?? 1;
  const hasMore =
    typeof result.hasMore === "boolean"
      ? result.hasMore
      : params.page < lastPageNumber;

  return {
    provider: providerId,
    lastPageNumber,
    hasMore,
    items: (result.movies ?? []).map((item) => mapMediaItem(item, providerId)),
  };
}

function mapDetailResponse(
  link: string,
  providerId: string,
  detail: Omit<StoredMovie, "link" | "updatedAt"> & { updatedAt?: string },
): V1MediaDetail {
  const seasons = (Array.isArray(detail.episodes) ? detail.episodes : []).map((season) => ({
    season: coerceString(season.season, "1"),
    episodes: (Array.isArray(season.episodes) ? season.episodes : []).map((ep) => ({
      link: coerceString(ep.link),
      title: coerceString(ep.title),
      image: coerceString(ep.image),
      numberEpisode: coerceString(ep.numberEpisode, "1"),
      caption: coerceString(ep.caption),
      context: coercePlainContext(ep.context),
    })),
  }));

  const resolvedType =
    detail.type === "movie" || detail.type === "serie"
      ? detail.type
      : seasons.length > 0 || link.toLowerCase().includes("serie")
        ? "serie"
        : "movie";

  const tags = Array.isArray(detail.tags)
    ? detail.tags
        .map((tag) => coerceString(tag).trim())
        .filter((tag) => tag.length > 0)
    : [];

  return {
    link,
    title: coerceNullableString(detail.title),
    image: coerceNullableString(detail.image),
    backgroundImage: coerceNullableString(detail.backgroundImage),
    rating: coerceNullableString(detail.rating),
    year: coerceNullableString(detail.year),
    duration: coerceNullableString(detail.duration),
    tags,
    caption: coerceNullableString(detail.caption),
    movieUrl: coerceNullableString(detail.movieUrl),
    updatedAt: asNonEmptyString(detail.updatedAt) ?? new Date().toISOString(),
    type: resolvedType,
    provider: asNonEmptyString(detail.provider) || providerId,
    context: coercePlainContext(detail.context),
    episodes: seasons,
  };
}

export async function getDetailPayload(
  params: {
    link: string;
    provider?: string;
    cookieProvider?: string;
  },
  deps: V1CatalogDeps = {},
): Promise<V1MediaDetail> {
  const resolved = { ...getDefaultDeps(), ...deps };
  const providers = buildProviderInfoList(resolved.getAvailableProviders());
  const explicitProvider = assertKnownProviderIfExplicit(
    asNonEmptyString(params.provider),
    providers,
  );

  const isRegistered = (id: string | undefined): id is string =>
    Boolean(id && providers.some((p) => p.id === id));

  const inferred = normalizeLegacyProviderId(resolved.inferProvider(params.link));
  const cachedProvider = normalizeLegacyProviderId(
    resolved.findProviderByLink(params.link),
  );

  const providerId =
    explicitProvider ??
    (isRegistered(inferred) ? inferred : undefined) ??
    (isRegistered(cachedProvider) ? cachedProvider : undefined) ??
    resolveActiveProvider(providers, params.cookieProvider);

  const driver = resolved.resolveDriver(providerId);

  let detail: Omit<StoredMovie, "link" | "updatedAt"> | undefined;
  try {
    detail = await driver.getDetail(params.link);
  } catch (err) {
    const status = extractHttpStatus(err);
    if (status === 404) {
      throw new V1ApiError(404, "NOT_FOUND", "Título no encontrado");
    }
    const message =
      err instanceof Error && err.message
        ? err.message
        : `Error al obtener el detalle en ${providerId}`;
    throw new V1ApiError(502, "UPSTREAM_ERROR", message);
  }

  if (!detail) {
    throw new V1ApiError(404, "NOT_FOUND", "Título no encontrado");
  }

  return mapDetailResponse(params.link, providerId, detail);
}

class StreamTimeoutError extends Error {
  constructor(message = "Error al obtener la URL del video") {
    super(message);
    this.name = "StreamTimeoutError";
  }
}

function classifyStreamError(err: unknown): V1ApiError {
  if (err instanceof V1ApiError) return err;

  const status = extractHttpStatus(err);
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Error al resolver la fuente de reproducción";

  if (status === 404) {
    return new V1ApiError(404, "NOT_FOUND", "Título o episodio no encontrado");
  }

  const lower = message.toLowerCase();
  const isTimeoutOrNetwork =
    err instanceof StreamTimeoutError ||
    lower.includes("error al obtener la url del video") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network request failed") ||
    (status !== undefined && status >= 400);

  if (isTimeoutOrNetwork) {
    return new V1ApiError(502, "UPSTREAM_ERROR", message);
  }

  const isStreamUnavailable =
    lower.includes("no streaming") ||
    lower.includes("no servers") ||
    lower.includes("no playable") ||
    lower.includes("could not extract") ||
    lower.includes("failed to extract player tokens") ||
    lower.includes("missing cryptographic keys") ||
    lower.includes("failed to parse datalink") ||
    lower.includes("no player embed") ||
    lower.includes("no video embed") ||
    lower.includes("no .m3u8") ||
    lower.includes("no datalink") ||
    lower.includes("unable to locate") ||
    lower.includes("not found in") ||
    lower.includes("invalid episode link") ||
    lower.includes("could not resolve");

  if (isStreamUnavailable) {
    return new V1ApiError(
      422,
      "STREAM_UNAVAILABLE",
      "No se pudo resolver ninguna fuente reproducible",
    );
  }

  return new V1ApiError(502, "UPSTREAM_ERROR", message);
}

async function executeWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  error: Error,
): Promise<T> {
  if (ms <= 0) {
    throw error;
  }
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(error);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getStreamPayload(
  input: {
    link: string;
    provider?: string;
    season?: string | number;
    episode?: string | number;
    language?: string;
    serverId?: string;
    detailContext?: Record<string, unknown>;
    params?: Record<string, unknown>;
    cookieProvider?: string;
  },
  deps: V1CatalogDeps = {},
): Promise<V1StreamResponse> {
  const resolved = { ...getDefaultDeps(), ...deps };
  const providers = buildProviderInfoList(resolved.getAvailableProviders());

  const explicitProviderHint =
    asNonEmptyString(input.provider) ??
    asNonEmptyString(input.params?.provider) ??
    asNonEmptyString(input.detailContext?.provider);

  const validatedExplicitProvider = assertKnownProviderIfExplicit(
    explicitProviderHint,
    providers,
  );

  const stored = validatedExplicitProvider
    ? resolved.getStored(validatedExplicitProvider, input.link)
    : resolved.getAnyStored(input.link);

  const isRegistered = (id: string | undefined): id is string =>
    Boolean(id && providers.some((p) => p.id === id));

  const storedProvider = normalizeLegacyProviderId(stored?.provider);
  const inferredProvider = normalizeLegacyProviderId(
    resolved.inferProvider(input.link, input.detailContext || input.params),
  );
  const cachedLookupProvider = normalizeLegacyProviderId(
    resolved.findProviderByLink(input.link),
  );

  const providerId =
    validatedExplicitProvider ??
    (isRegistered(storedProvider) ? storedProvider : undefined) ??
    (isRegistered(inferredProvider) ? inferredProvider : undefined) ??
    (isRegistered(cachedLookupProvider) ? cachedLookupProvider : undefined) ??
    resolveActiveProvider(providers, input.cookieProvider);

  const mergedParams: Record<string, unknown> = {
    ...stored?.context,
    ...input.params,
    provider: providerId,
  };
  if (input.language && mergedParams.lang === undefined) {
    mergedParams.lang = input.language;
  }

  const resolvedSeason =
    input.season ??
    (typeof input.params?.season === "string" || typeof input.params?.season === "number"
      ? input.params.season
      : undefined) ??
    (typeof input.detailContext?.season === "string" ||
    typeof input.detailContext?.season === "number"
      ? input.detailContext.season
      : undefined);

  const resolvedEpisode =
    input.episode ??
    (typeof input.params?.episode === "string" || typeof input.params?.episode === "number"
      ? input.params.episode
      : undefined) ??
    (typeof input.detailContext?.episode === "string" ||
    typeof input.detailContext?.episode === "number"
      ? input.detailContext.episode
      : undefined);

  const mergedOptions: GetUrlOptions = {
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(resolvedSeason !== undefined ? { season: resolvedSeason } : {}),
    ...(resolvedEpisode !== undefined ? { episode: resolvedEpisode } : {}),
    detailContext: {
      ...stored?.context,
      ...input.detailContext,
      provider: providerId,
    },
    params: mergedParams,
  };

  const driver = resolved.resolveDriver(providerId);
  const maxAttempts = Math.max(1, resolved.streamAttempts);
  const deadline = Date.now() + resolved.streamTimeoutMs;
  let lastError: unknown;
  let streamResult;

  for (let attemptIdx = 0; attemptIdx < maxAttempts; attemptIdx++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      lastError = lastError ?? new StreamTimeoutError();
      break;
    }

    try {
      streamResult = await executeWithTimeout(
        driver.getUrl(input.link, mergedOptions),
        remainingMs,
        new StreamTimeoutError(),
      );
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof StreamTimeoutError || extractHttpStatus(err) === 404) {
        break;
      }

      const hasMoreAttempts = attemptIdx < maxAttempts - 1;
      const msLeftForRetry = deadline - Date.now();
      if (!hasMoreAttempts || msLeftForRetry <= resolved.streamRetryDelayMs) {
        break;
      }

      if (resolved.streamRetryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, resolved.streamRetryDelayMs));
      }
    }
  }

  if (lastError !== undefined || !streamResult) {
    throw classifyStreamError(lastError);
  }

  const primaryUrl = asNonEmptyString(streamResult.url);
  const fallbackUrl = asNonEmptyString(streamResult.fallbackUrl);
  if (!primaryUrl && !fallbackUrl) {
    throw new V1ApiError(
      422,
      "STREAM_UNAVAILABLE",
      "No se pudo resolver ninguna fuente reproducible",
    );
  }

  const headers: Record<string, string> = {};
  if (streamResult.headers && typeof streamResult.headers === "object") {
    for (const [key, value] of Object.entries(streamResult.headers)) {
      if (typeof value === "string" && value.trim().length > 0) {
        headers[key] = value;
      }
    }
  }

  const headerReferer = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "referer",
  )?.[1];

  const referer =
    asNonEmptyString(streamResult.referer) ??
    asNonEmptyString(headerReferer) ??
    null;

  return {
    url: primaryUrl ?? null,
    fallbackUrl: fallbackUrl ?? null,
    headers,
    directSegments: Boolean(streamResult.directSegments),
    referer,
  };
}
