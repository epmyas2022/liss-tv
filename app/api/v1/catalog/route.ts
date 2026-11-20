import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth } from "@/services/v1-auth.service";
import {
  getCatalogPayload,
  PROVIDER_COOKIE_NAME,
} from "@/services/v1-catalog.service";
import { handleV1Error, v1ErrorResponse } from "@/utils/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireV1Auth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = req.nextUrl.searchParams;
  const rawPage = searchParams.get("page");
  let page = 1;

  if (rawPage !== null && rawPage.trim() !== "") {
    const trimmedPage = rawPage.trim();
    if (!/^\d+$/.test(trimmedPage)) {
      return v1ErrorResponse(
        400,
        "INVALID_REQUEST",
        "El parámetro 'page' debe ser un número entero positivo",
      );
    }
    page = Number.parseInt(trimmedPage, 10);
    if (!Number.isSafeInteger(page) || page < 1) {
      return v1ErrorResponse(
        400,
        "INVALID_REQUEST",
        "El parámetro 'page' debe ser mayor o igual a 1",
      );
    }
  }

  try {
    const cookieProvider = req.cookies.get(PROVIDER_COOKIE_NAME)?.value;
    const payload = await getCatalogPayload({
      provider: searchParams.get("provider") ?? undefined,
      filter: searchParams.get("filter") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page,
      cookieProvider,
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return handleV1Error(err, "Error al obtener el catálogo");
  }
}
