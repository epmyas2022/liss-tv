import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth } from "@/services/v1-auth.service";
import {
  getDetailPayload,
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
  const link = searchParams.get("link")?.trim();
  if (!link) {
    return v1ErrorResponse(
      400,
      "INVALID_REQUEST",
      "El parámetro 'link' es obligatorio",
    );
  }

  try {
    const cookieProvider = req.cookies.get(PROVIDER_COOKIE_NAME)?.value;
    const payload = await getDetailPayload({
      link,
      provider: searchParams.get("provider") ?? undefined,
      cookieProvider,
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return handleV1Error(err, "Error al obtener el detalle del título");
  }
}
