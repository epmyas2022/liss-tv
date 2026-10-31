import { Action } from "@/types/action";

import TorControl, { TorControlStatus } from "tor-control";

export const torControl = new TorControl({
  host: "127.0.0.1",
  port: 9051,
  persistent: true,
});

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  error: Error,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.warn(`⏳ Server Action cancelado tras ${ms}ms.`);
      reject(error);
    }, ms);
  });

  const result = await Promise.race([promise, timeoutPromise]);

  clearTimeout(timeoutId!);

  return result;
}

export async function tryCatch<T>(
  promise: T,
  onError?: (error: unknown) => void,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (onError) onError(error);
    console.error("❌ Error en tryCatch", error);
    return null;
  }
}

export async function attempt<T>(action: Action<T>): Promise<T> {
  const {
    attempts: maxAttempts,
    delay,
    execute,
    attemptAction,
    errorHandler,
  } = action;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await execute();
    } catch (error) {
      console.error(`❌ intento ${attempt + 1}/${maxAttempts}`, error);
      errorHandler?.(error);

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (attemptAction) {
    return await attempt(attemptAction);
  }

  throw new Error("Todas las acciones fallaron después de todos los intentos");
}

export async function attempts<T>(actions: Action<T>[]): Promise<T> {
  for (const action of actions) {
    return await attempt(action);
  }

  throw new Error("Todas las acciones fallaron después de todos los intentos");
}

export function isUrlMediafire(url: string): boolean {
  const mediafireRegex =
    /https:\/\/download[^\s"'><]+mediafire\.com[^\s"'><]+/i;
  return mediafireRegex.test(url);
}
/**
 * Extrae la URL canónica permanente de Mediafire (https://www.mediafire.com/file/<key>)
 * a partir de un enlace de descarga directa temporal o de una URL de proxy.
 */
export function extractMediafireFileUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  let url = rawUrl;

  if (url.includes("url=")) {
    try {
      const parsed = new URL(url, "http://localhost");
      const param = parsed.searchParams.get("url");
      if (param) url = param;
    } catch (_) {}
  }

  // Caso 1: Enlace estándar: https://www.mediafire.com/file/<key> o /download/<key>
  const fileMatch = url.match(
    /https?:\/\/(?:www\.)?mediafire\.com\/(?:file|download)\/([a-zA-Z0-9]+)/i,
  );
  if (fileMatch) {
    return `https://www.mediafire.com/file/${fileMatch[1]}`;
  }

  // Caso 2: Enlace de descarga directa: https://downloadXXXX.mediafire.com/<token>/<key>/<filename>
  const downloadMatch = url.match(
    /https?:\/\/download\d*\.mediafire\.com\/[^\/]+\/([a-zA-Z0-9]+)/i,
  );
  if (downloadMatch) {
    return `https://www.mediafire.com/file/${downloadMatch[1]}`;
  }

  return null;
}

export async function getLinkMediafire(url: string) {
  if (!url || !url.startsWith("http")) {
    return null;
  }
  try {
    const result = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!result.ok) throw new Error(`HTTP error! status: ${result.status}`);

    const html = await result.text();
    const regexLink = /https:\/\/download[^\s"'><]+mediafire\.com[^\s"'><]+/i;

    if (!regexLink.test(html)) {
      console.warn(
        "No se encontró un enlace de descarga en la página de Mediafire.",
      );
      return null;
    }

    const match = html.match(regexLink);

    return match ? match[0] : "";
  } catch (error) {
    console.error("❌ Error al obtener el enlace de Mediafire:", error);
    return null;
  }
}

export async function changeTorIdentity(): Promise<TorControlStatus | null> {
  return new Promise((resolve, reject) => {
    console.log("🔄 Intentando cambiar la identidad de Tor...");
    torControl.signalNewnym((err, status) => {
      if (err) {
        console.error("❌ Error al cambiar la identidad de Tor:", err);
        return reject(err);
      }
      console.log("✅ Identidad de Tor cambiada con éxito:", status);
      resolve(status);
    });
  });
}
