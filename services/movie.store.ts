import fs from "fs";
import path from "path";

import { StoredMovie } from "../types/movie";

const STORE_PATH = path.join(process.cwd(), "data", "movies.json");



function read(): Record<string, StoredMovie> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
}

function write(store: Record<string, StoredMovie>): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/** Upsert by link — merges partial data, never duplicates */
export function upsert(link: string, data: Partial<Omit<StoredMovie, "link" | "updatedAt">>): StoredMovie {
  const store = read();
  store[link] = { ...store[link], ...data, link, updatedAt: new Date().toISOString() };
  write(store);
  return store[link];
}

export function get(link: string): StoredMovie | undefined {
  return read()[link];
}

export function getAll(): StoredMovie[] {
  return Object.values(read());
}


