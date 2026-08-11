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
  promise: Promise<T>,
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
