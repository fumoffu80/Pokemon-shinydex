#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_FILE = resolve(ROOT, "data/pokedex-data.js");
const ASSET_DIR = resolve(ROOT, "assets");
const CACHE_DIR = resolve(ROOT, ".cache/sprites");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const LANGUAGE_FR = 5;
const LANGUAGE_EN = 9;
const CELL_SIZE = 96;
const ATLAS_COLUMNS = 20;
const ATLAS_ROWS = 20;
const ATLAS_CAPACITY = ATLAS_COLUMNS * ATLAS_ROWS;
const ATLAS_SIZE = CELL_SIZE * ATLAS_COLUMNS;

const CSV_FILES = [
  "pokemon.csv",
  "pokemon_species.csv",
  "pokemon_species_names.csv",
  "pokemon_forms.csv",
  "pokemon_form_names.csv",
  "pokemon_types.csv",
  "type_names.csv"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter(values => values.some(Boolean))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "pokemon-shinydex-builder" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolveDelay => setTimeout(resolveDelay, 500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${lastError?.message || "Téléchargement impossible"} — ${url}`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function titleCase(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hashPair(normal, shiny) {
  return createHash("sha256").update(normal).update(shiny).digest("hex");
}

function cachePath(url) {
  const parsed = new URL(url);
  return resolve(CACHE_DIR, parsed.pathname.replace(/^.*\/sprites\/pokemon\//, ""));
}

async function downloadSprite(url) {
  const target = cachePath(url);
  try {
    return await readFile(target);
  } catch {
    // Le cache est facultatif.
  }

  try {
    const response = await fetchWithRetry(url, 3);
    const buffer = Buffer.from(await response.arrayBuffer());
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") return null;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return buffer;
  } catch {
    return null;
  }
}

function spriteStem(form) {
  if (form.is_default === "1") return form.pokemon_id;
  if (!form.form_identifier) return null;
  return `${form.pokemon_id}-${form.form_identifier}`;
}

function compactLabel(form, namesByForm) {
  const localized = namesByForm.get(`${form.id}:${LANGUAGE_FR}`);
  if (localized?.form_name) return localized.form_name;
  if (localized?.pokemon_name) return localized.pokemon_name;
  return form.form_identifier ? titleCase(form.form_identifier) : "";
}

async function buildAtlas(entries, kind, atlasIndex) {
  const start = atlasIndex * ATLAS_CAPACITY;
  const slice = entries.slice(start, start + ATLAS_CAPACITY);
  const composites = await Promise.all(slice.map(async (entry, index) => {
    const buffer = kind === "normal" ? entry.normalBuffer : entry.shinyBuffer;
    const prepared = await sharp(buffer)
      .resize(CELL_SIZE, CELL_SIZE, { fit: "contain", kernel: "nearest" })
      .png()
      .toBuffer();
    return {
      input: prepared,
      left: (index % ATLAS_COLUMNS) * CELL_SIZE,
      top: Math.floor(index / ATLAS_COLUMNS) * CELL_SIZE
    };
  }));

  const output = resolve(ASSET_DIR, `sprites-${kind}-${atlasIndex}.webp`);
  await sharp({
    create: {
      width: ATLAS_SIZE,
      height: ATLAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .webp({ lossless: true, effort: 4 })
    .toFile(output);
}

await mkdir(ASSET_DIR, { recursive: true });
await mkdir(dirname(DATA_FILE), { recursive: true });

console.log("Téléchargement des tables Pokédex…");
const csvContents = await mapLimit(CSV_FILES, 7, async file => {
  const response = await fetchWithRetry(`${CSV_BASE}/${file}`);
  return [file, parseCsv(await response.text())];
});
const tables = Object.fromEntries(csvContents);

const pokemonById = new Map(tables["pokemon.csv"].map(row => [Number(row.id), row]));
const speciesRows = tables["pokemon_species.csv"].map(row => ({
  ...row,
  id: Number(row.id),
  generation_id: Number(row.generation_id),
  has_gender_differences: row.has_gender_differences === "1"
}));
const speciesById = new Map(speciesRows.map(row => [row.id, row]));

const speciesNames = new Map(
  tables["pokemon_species_names.csv"]
    .filter(row => Number(row.local_language_id) === LANGUAGE_FR || Number(row.local_language_id) === LANGUAGE_EN)
    .map(row => [`${row.pokemon_species_id}:${row.local_language_id}`, row.name])
);
const namesByForm = new Map(
  tables["pokemon_form_names.csv"].map(row => [`${row.pokemon_form_id}:${row.local_language_id}`, row])
);
const typeNames = new Map(
  tables["type_names.csv"]
    .filter(row => Number(row.local_language_id) === LANGUAGE_FR)
    .map(row => [Number(row.type_id), row.name])
);
const typesByPokemon = new Map();
for (const row of tables["pokemon_types.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const list = typesByPokemon.get(pokemonId) || [];
  list.push({ slot: Number(row.slot), name: typeNames.get(Number(row.type_id)) || `Type ${row.type_id}` });
  typesByPokemon.set(pokemonId, list);
}

const eligibleForms = tables["pokemon_forms.csv"]
  .filter(form => form.is_battle_only === "0" && form.is_mega === "0")
  .filter(form => speciesById.has(Number(pokemonById.get(Number(form.pokemon_id))?.species_id)))
  .sort((a, b) => {
    const pokemonA = pokemonById.get(Number(a.pokemon_id));
    const pokemonB = pokemonById.get(Number(b.pokemon_id));
    const speciesDifference = Number(pokemonA?.species_id) - Number(pokemonB?.species_id);
    if (speciesDifference) return speciesDifference;
    return Number(a.order) - Number(b.order) || Number(a.form_order) - Number(b.form_order);
  });

const candidates = [];
for (const form of eligibleForms) {
  const pokemon = pokemonById.get(Number(form.pokemon_id));
  const species = speciesById.get(Number(pokemon.species_id));
  const stem = spriteStem(form);
  if (!stem) continue;

  const common = {
    key: `${species.id}:${form.id}:default`,
    speciesId: species.id,
    slug: species.identifier,
    name: speciesNames.get(`${species.id}:${LANGUAGE_FR}`)
      || speciesNames.get(`${species.id}:${LANGUAGE_EN}`)
      || titleCase(species.identifier),
    generation: species.generation_id,
    pokemonId: Number(form.pokemon_id),
    formId: Number(form.id),
    formOrder: Number(form.order),
    label: compactLabel(form, namesByForm),
    gender: "",
    types: (typesByPokemon.get(Number(form.pokemon_id)) || [])
      .sort((a, b) => a.slot - b.slot)
      .map(type => type.name),
    normalUrl: `${SPRITE_BASE}/${stem}.png`,
    shinyUrl: `${SPRITE_BASE}/shiny/${stem}.png`
  };
  candidates.push(common);

  if (species.has_gender_differences && form.is_default === "1") {
    candidates.push({
      ...common,
      key: `${species.id}:${form.id}:female`,
      gender: "female",
      label: "Femelle",
      normalUrl: `${SPRITE_BASE}/female/${stem}.png`,
      shinyUrl: `${SPRITE_BASE}/shiny/female/${stem}.png`
    });
  }
}

console.log(`Téléchargement de ${candidates.length} paires de sprites candidates…`);
let completed = 0;
const downloaded = await mapLimit(candidates, 36, async candidate => {
  const [normalBuffer, shinyBuffer] = await Promise.all([
    downloadSprite(candidate.normalUrl),
    downloadSprite(candidate.shinyUrl)
  ]);
  completed += 1;
  if (completed % 100 === 0 || completed === candidates.length) {
    process.stdout.write(`\r${completed}/${candidates.length}`);
  }
  if (!normalBuffer || !shinyBuffer) return null;
  return { ...candidate, normalBuffer, shinyBuffer, visualHash: hashPair(normalBuffer, shinyBuffer) };
});
process.stdout.write("\n");

const uniqueEntries = [];
const seenBySpecies = new Map();
for (const candidate of downloaded.filter(Boolean)) {
  const seen = seenBySpecies.get(candidate.speciesId) || new Set();
  if (seen.has(candidate.visualHash)) continue;
  seen.add(candidate.visualHash);
  seenBySpecies.set(candidate.speciesId, seen);
  uniqueEntries.push(candidate);
}

const countsBySpecies = new Map();
for (const entry of uniqueEntries) {
  countsBySpecies.set(entry.speciesId, (countsBySpecies.get(entry.speciesId) || 0) + 1);
}

for (const [speciesId, count] of countsBySpecies) {
  if (count < 2) continue;
  const entries = uniqueEntries.filter(entry => entry.speciesId === speciesId);
  const hasFemale = entries.some(entry => entry.gender === "female");
  if (hasFemale) {
    const defaultEntry = entries.find(entry => !entry.gender && !entry.label);
    if (defaultEntry) defaultEntry.label = "Mâle";
  }
}

for (const entry of uniqueEntries) {
  if (countsBySpecies.get(entry.speciesId) === 1) {
    entry.label = "";
  } else if (!entry.label) {
    entry.label = entry.gender === "female" ? "Femelle" : "Forme standard";
  }
}

const atlasCount = Math.ceil(uniqueEntries.length / ATLAS_CAPACITY);
console.log(`Création de ${atlasCount * 2} planches de sprites WebP…`);
for (let atlasIndex = 0; atlasIndex < atlasCount; atlasIndex += 1) {
  await Promise.all([
    buildAtlas(uniqueEntries, "normal", atlasIndex),
    buildAtlas(uniqueEntries, "shiny", atlasIndex)
  ]);
}

const entries = uniqueEntries.map((entry, index) => ({
  key: entry.key,
  speciesId: entry.speciesId,
  slug: entry.slug,
  name: entry.name,
  generation: entry.generation,
  types: entry.types,
  label: entry.label,
  variant: countsBySpecies.get(entry.speciesId) > 1,
  sheet: Math.floor(index / ATLAS_CAPACITY),
  slot: index % ATLAS_CAPACITY
}));

const generations = [...new Set(speciesRows.map(species => species.generation_id))].sort((a, b) => a - b);
const types = [...new Set(entries.flatMap(entry => entry.types))].sort((a, b) => a.localeCompare(b, "fr"));
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  speciesCount: speciesRows.length,
  appearanceCount: entries.length,
  cellSize: CELL_SIZE,
  atlasColumns: ATLAS_COLUMNS,
  atlasSize: ATLAS_SIZE,
  normalSheets: Array.from({ length: atlasCount }, (_, index) => `assets/sprites-normal-${index}.webp`),
  shinySheets: Array.from({ length: atlasCount }, (_, index) => `assets/sprites-shiny-${index}.webp`),
  generations,
  types,
  entries
};

const javascript = `/* Généré par tools/update-data.mjs — ne pas modifier manuellement. */\nwindow.SHINYDEX_DATA = ${JSON.stringify(payload)};\n`;
await writeFile(DATA_FILE, javascript);

console.log(
  `Base générée : ${payload.speciesCount} espèces, ${payload.appearanceCount} apparences, `
  + `${atlasCount} planches normales + ${atlasCount} shiny.`
);
