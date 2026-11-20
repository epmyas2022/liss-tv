import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth } from "@/services/v1-auth.service";
import {
  getStreamPayload,
  PROVIDER_COOKIE_NAME,
} from "@/services/v1-catalog.service";
import {
  asNonEmptyString,
  handleV1Error,
  isPlainObject,
  v1ErrorResponse,
} from "@/utils/api-v1";

export const dynamic = "force-dynamic";

function parseOptionalStringField(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  const raw = body[field];
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `El campo '${field}' debe ser una cadena de texto` };
  }
  return { ok: true, value: asNonEmptyString(raw) };
}

function parseOptionalCoordField(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: string | number | undefined } | { ok: false; error: string } {
  const raw = body[field];
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (typeof raw === "string") {
    return { ok: true, value: asNonEmptyString(raw) };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, error: `El campo '${field}' debe ser texto o número válido` };
}

function parseOptionalObjectField(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string } {
  const raw = body[field];
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: `El campo '${field}' debe ser un objeto JSON` };
  }
  return { ok: true, value: raw };
}

export async function POST(req: NextRequest) {
  const auth = await requireV1Auth(req);
  if (!auth.ok) {
    return auth.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return v1ErrorResponse(400, "INVALID_REQUEST", "Cuerpo JSON inválido");
  }

  if (!isPlainObject(rawBody)) {
    return v1ErrorResponse(
      400,
      "INVALID_REQUEST",
      "El cuerpo de la petición debe ser un objeto JSON",
    );
  }

  const link = asNonEmptyString(rawBody.link);
  if (!link) {
    return v1ErrorResponse(
      400,
      "INVALID_REQUEST",
      "El campo 'link' es obligatorio",
    );
  }

  const providerField = parseOptionalStringField(rawBody, "provider");
  if (!providerField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", providerField.error);
  }

  const languageField = parseOptionalStringField(rawBody, "language");
  if (!languageField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", languageField.error);
  }

  const serverIdField = parseOptionalStringField(rawBody, "serverId");
  if (!serverIdField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", serverIdField.error);
  }

  const seasonField = parseOptionalCoordField(rawBody, "season");
  if (!seasonField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", seasonField.error);
  }

  const episodeField = parseOptionalCoordField(rawBody, "episode");
  if (!episodeField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", episodeField.error);
  }

  const detailContextField = parseOptionalObjectField(rawBody, "detailContext");
  if (!detailContextField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", detailContextField.error);
  }

  const paramsField = parseOptionalObjectField(rawBody, "params");
  if (!paramsField.ok) {
    return v1ErrorResponse(400, "INVALID_REQUEST", paramsField.error);
  }

  try {
    const cookieProvider = req.cookies.get(PROVIDER_COOKIE_NAME)?.value;
    const payload = await getStreamPayload({
      link,
      provider: providerField.value,
      season: seasonField.value,
      episode: episodeField.value,
      language: languageField.value,
      serverId: serverIdField.value,
      detailContext: detailContextField.value,
      params: paramsField.value,
      cookieProvider,
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return handleV1Error(err, "Error al resolver la fuente de reproducción");
  }
}
