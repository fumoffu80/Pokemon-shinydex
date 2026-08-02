#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const COVER_DIRECTORY = resolve(ROOT, "assets/game-covers");
const CATEGORY_DIRECTORY = resolve(ROOT, "assets/move-categories");
const SOURCE_MANIFEST = resolve(ROOT, "data/game-asset-sources.json");
const execFileAsync = promisify(execFile);
const missingOnly = process.argv.includes("--missing-only");

const GAME_COVERS = {
  1: "Red EN boxart.png",
  2: "Blue EN boxart.png",
  3: "Yellow EN boxart.png",
  4: "Gold EN boxart.png",
  5: "Silver EN boxart.png",
  6: "Crystal EN boxart.png",
  7: "Ruby EN boxart.png",
  8: "Sapphire EN boxart.png",
  9: "Emerald EN boxart.jpg",
  10: "FireRed EN boxart.png",
  11: "LeafGreen EN boxart.png",
  12: "Diamond EN boxart.jpg",
  13: "Pearl EN boxart.jpg",
  14: "Platinum EN boxart.png",
  15: "HeartGold EN boxart.jpg",
  16: "SoulSilver EN boxart.jpg",
  17: "Black EN boxart.png",
  18: "White EN boxart.png",
  21: "Black 2 EN boxart.png",
  22: "White 2 EN boxart.png",
  23: "X EN boxart.png",
  24: "Y EN boxart.png",
  25: "Omega Ruby EN boxart.png",
  26: "Alpha Sapphire EN boxart.png",
  27: "Sun EN boxart.png",
  28: "Moon EN boxart.png",
  29: "Ultra Sun EN boxart.png",
  30: "Ultra Moon EN boxart.png",
  31: "Lets Go Pikachu EN boxart.png",
  32: "Lets Go Eevee EN boxart.png",
  33: "Sword EN boxart.png",
  34: "Shield EN boxart.png",
  37: "Brilliant Diamond EN boxart.png",
  38: "Shining Pearl EN boxart.png",
  39: "Legends Arceus EN boxart.png",
  40: "Scarlet EN boxart.png",
  41: "Violet EN boxart.png",
  44: "Red JP boxart.png",
  45: "Green JP boxart.png",
  46: "Blue JP boxart.png",
  47: "Legends Z-A EN boxart.png"
};

const MOVE_CATEGORIES = {
  physical: "PhysicalIC.png",
  special: "SpecialIC.png",
  status: "StatusIC.png"
};

async function download(url) {
  const { stdout } = await execFileAsync("curl", [
    "--location",
    "--fail",
    "--silent",
    "--show-error",
    "--retry", "5",
    "--retry-all-errors",
    "--retry-delay", "2",
    "--max-time", "90",
    String(url)
  ], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function sourceFor(filename, thumbnailWidth = 0) {
  const normalized = filename.replaceAll(" ", "_");
  const hash = createHash("md5").update(normalized).digest("hex");
  const originalUrl = `https://archives.bulbagarden.net/media/upload/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(normalized)}`;
  return {
    filename,
    fileUrl: thumbnailWidth
      ? `https://archives.bulbagarden.net/media/upload/thumb/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(normalized)}/${thumbnailWidth}px-${encodeURIComponent(normalized)}`
      : originalUrl,
    originalUrl,
    pageUrl: `https://archives.bulbagarden.net/wiki/File:${encodeURIComponent(normalized)}`
  };
}

await mkdir(COVER_DIRECTORY, { recursive: true });
await mkdir(CATEGORY_DIRECTORY, { recursive: true });

const coverSources = {};
for (const [id, filename] of Object.entries(GAME_COVERS)) {
  const source = sourceFor(filename, 420);
  const output = resolve(COVER_DIRECTORY, `${id}.webp`);
  coverSources[id] = { filename, originalUrl: source.originalUrl, pageUrl: source.pageUrl };
  if (missingOnly) {
    try {
      await access(output);
      console.log(`Jaquette ${id} déjà présente : ${filename}`);
      continue;
    } catch {}
  }
  let input;
  try {
    input = await download(source.fileUrl);
  } catch {
    input = await download(source.originalUrl);
  }
  const cover = await sharp(input)
    .resize({ width: 280, height: 360, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toBuffer();
  await writeFile(output, cover);
  console.log(`Jaquette ${id} : ${filename}`);
}

const moveCategorySources = {};
for (const [category, filename] of Object.entries(MOVE_CATEGORIES)) {
  const source = sourceFor(filename);
  const icon = await sharp(await download(source.fileUrl)).png().toBuffer();
  await writeFile(resolve(CATEGORY_DIRECTORY, `${category}.png`), icon);
  moveCategorySources[category] = { filename, originalUrl: source.originalUrl, pageUrl: source.pageUrl };
  console.log(`Catégorie ${category} : ${filename}`);
}

await writeFile(SOURCE_MANIFEST, `${JSON.stringify({
  schemaVersion: 1,
  source: "Bulbagarden Archives",
  sourceUrl: "https://archives.bulbagarden.net/",
  covers: coverSources,
  moveCategories: moveCategorySources
}, null, 2)}\n`);

console.log(`${Object.keys(coverSources).length} jaquettes et ${Object.keys(moveCategorySources).length} icônes exportées.`);
