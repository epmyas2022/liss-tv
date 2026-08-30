import { Action } from "@/types/action";

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
  const { attempts: maxAttempts, delay, execute, attemptAction } = action;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await execute();
    } catch (error) {
      console.error(`❌ intento ${attempt + 1}/${maxAttempts}`, error);

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
export async function getLinkMediafire(url: string) {
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
