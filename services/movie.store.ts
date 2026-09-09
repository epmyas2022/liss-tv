import fs from "fs";
import path from "path";

import { StoredMovie } from "../types/movie";

const STORE_PATH = path.join(process.cwd(), "data", "movies.json");

function read<T>(): Record<string, T> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
}

function write<T>(store: Record<string, T>): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/** Upsert by link — merges partial data, never duplicates */
export function upsert(
  link: string,
  data: Partial<Omit<StoredMovie, "link" | "updatedAt">>,
): StoredMovie {
  const store = read<StoredMovie>();
  store[link] = {
    ...store[link],
    ...data,
    link,
    updatedAt: new Date().toISOString(),
  };
  write(store);
  return store[link];
}

export function upsertAll<T>(prefix: string, data: T): void {
  const store = read<{ data: T; updatedAt: string }>();

  store[prefix] = {
    data: data,
    updatedAt: new Date().toISOString(),
  };

  write(store);

  return;
}

export function get(link: string): StoredMovie | undefined {
  return read<StoredMovie>()[link];
}

export function remove(link: string): void {
  const store = read<StoredMovie>();

  if (!store[link]) return;

  delete store[link];
  write(store);
}

export function getAllData<A>(
  key: string,
): { data: A; updatedAt: string } | undefined {
  return (read()[key] as { data: A; updatedAt: string }) || undefined;
}
