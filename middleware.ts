import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const isPublicRoute = request.nextUrl.pathname.startsWith("/login");

  // Verifica si existe la cookie generada por PocketBase
  const pbAuthCookie = request.cookies.get("pb_auth");

  let isAuthenticated = false;

  if (pbAuthCookie && pbAuthCookie.value) {
    try {
      // La cookie de PocketBase viene como un JSON string encodeado: { "token": "...", "model": {...} }
      const parsedPb = JSON.parse(decodeURIComponent(pbAuthCookie.value));
      const token = parsedPb?.token;

      if (token) {
        // OPCIÓN 1: Validación real haciendo fetch a PocketBase (100% seguro)
        // Usamos el endpoint auth-refresh. Si el token expiró o fue revocado, dará 401.
        const pbUrl =
          process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

        const response = await fetch(
          `${pbUrl}/api/collections/users/auth-refresh`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            // cache: 'no-store' es importante para que Next.js no cachee la respuesta en SSR
            cache: "no-store",
          },
        );

        if (response.ok) {
          isAuthenticated = true;
        } else {
          // Si da 401 (o cualquier error), el token ya no sirve
          isAuthenticated = false;
        }
      }
    } catch (e) {
      console.error("Error validando token de PocketBase en middleware:", e);
      isAuthenticated = false;
    }
  }

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);

    // Si la cookie existía pero ya no es válida, podríamos limpiar la cookie al redirigir
    const res = NextResponse.redirect(loginUrl);
    if (pbAuthCookie) {
      res.cookies.delete("pb_auth");
    }
    return res;
  }

  if (isAuthenticated && isPublicRoute) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica el middleware a todas las rutas excepto:
     * - api (API routes)
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico (icono de la pestaña)
     * - archivos con extensiones comunes de recursos estáticos
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest\\.webmanifest|manifest\\.json|service-worker\\.js|.*\\.png$|.*\\.jpg$).*)",
  ],
};
