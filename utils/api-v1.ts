import { NextResponse } from "next/server";
import type { MediaType } from "@/types/domain";

export type V1ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "STREAM_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export interface V1ErrorPayload {
  error: {
    code: V1ErrorCode;
    message: string;
  };
}

export interface V1ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  disabledReason: string | null;
  supportsMovies: boolean;
  supportsSeries: boolean;
}

export interface V1ProvidersResponse {
  activeProvider: string;
  providers: V1ProviderInfo[];
}

export interface V1MediaItem {
  id: string | null;
  link: string;
  image: string;
  rating: string;
  title: string;
  year: string;
  type: MediaType | null;
  provider: string | null;
  context: Record<string, unknown> | null;
}

export interface V1CatalogResponse {
  provider: string;
  lastPageNumber: number;
  hasMore: boolean;
  items: V1MediaItem[];
}

export interface V1Episode {
  link: string;
  title: string;
  image: string;
  numberEpisode: string;
  caption: string;
  context: Record<string, unknown> | null;
}

export interface V1Season {
  season: string;
  episodes: V1Episode[];
}

export interface V1MediaDetail {
  link: string;
  title: string | null;
  image: string | null;
  backgroundImage: string | null;
  rating: string | null;
  year: string | null;
  duration: string | null;
  tags: string[];
  caption: string | null;
  movieUrl: string | null;
  updatedAt: string | null;
  type: MediaType | null;
  provider: string | null;
  context: Record<string, unknown> | null;
  episodes: V1Season[];
}

export interface V1StreamResponse {
  url: string | null;
  fallbackUrl: string | null;
  headers: Record<string, string>;
  directSegments: boolean;
  referer: string | null;
}

export class V1ApiError extends Error {
  readonly status: number;
  readonly code: V1ErrorCode;

  constructor(status: number, code: V1ErrorCode, message: string) {
    super(message);
    this.name = "V1ApiError";
    this.status = status;
    this.code = code;
  }
}

export function v1ErrorResponse(
  status: number,
  code: V1ErrorCode,
  message: string,
): NextResponse<V1ErrorPayload> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function handleV1Error(
  err: unknown,
  fallbackMessage: string,
): NextResponse<V1ErrorPayload> {
  if (err instanceof V1ApiError) {
    return v1ErrorResponse(err.status, err.code, err.message);
  }
  const message = err instanceof Error && err.message ? err.message : fallbackMessage;
  return v1ErrorResponse(502, "UPSTREAM_ERROR", message);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
