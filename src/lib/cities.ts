import fs from "node:fs";
import path from "node:path";
import { logMain } from "./log.js";

let cache: City[] | null = null;
let dirname = "";

export function initCities(appDir: string): void {
  dirname = appDir;
}

export function loadCities(): City[] {
  if (cache) return cache;
  const p = path.join(dirname, "data", "cities.json");
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as City[];
    cache = Array.isArray(raw) ? raw : [];
  } catch (e) {
    logMain("[Cities] failed to load", p, String(e));
    cache = [];
  }
  return cache;
}
