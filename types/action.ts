export type Action<T> = {
  execute: () => Promise<T>;
  attempts: number;
  delay: number;
  attemptAction?: Action<T> | null;
};
