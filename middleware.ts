import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Lista de rutas públicas (que no requieren autenticación)
  const isPublicRoute = request.nextUrl.pathname.startsWith('/login');

  // Verifica si existe la cookie generada por PocketBase
  const pbAuthCookie = request.cookies.get('pb_auth');
  
  const isAuthenticated = pbAuthCookie && pbAuthCookie.value !== '';

  if (!isAuthenticated && !isPublicRoute) {
    // Si no está autenticado y trata de entrar a una ruta privada, al login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicRoute) {
    // Si está autenticado y trata de entrar al login, al inicio
    const homeUrl = new URL('/', request.url);
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
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
