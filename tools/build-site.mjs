#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "_site");
const files = [
  "index.html",
  "styles.css",
  "shinydex-enhancements.css",
  "i18n.js",
  "gender-differences.js",
  "app.js",
  "shinydex-enhancements.js",
  "firebase-sync.js",
  "manifest.webmanifest",
  "sw.js",
  ".nojekyll",
  "data",
  "assets"
];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of files) {
  await cp(resolve(root, file), resolve(destination, file), { recursive: true });
}
console.log(`Site prêt dans ${destination}`);
