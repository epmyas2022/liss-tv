import { NextRequest, NextResponse } from "next/server";
import { requireV1Auth } from "@/services/v1-auth.service";
import {
  getProvidersPayload,
  PROVIDER_COOKIE_NAME,
} from "@/services/v1-catalog.service";
import { handleV1Error } from "@/utils/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireV1Auth(req);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const cookieProvider = req.cookies.get(PROVIDER_COOKIE_NAME)?.value;
    const payload = getProvidersPayload(cookieProvider);
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return handleV1Error(err, "Error al listar los proveedores disponibles");
  }
}
