#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_FILE = resolve(ROOT, "data/pokedex-data.js");
const ASSET_DIR = resolve(ROOT, "assets");
const CACHE_DIR = resolve(ROOT, ".cache/sprites");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const LANGUAGES = { fr: 5, en: 9, es: 7, de: 6, it: 8, ja: 1 };
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
  "types.csv",
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
    if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return buffer;
  } catch {
    return null;
  }
}

async function downloadFirst(urls) {
  for (const url of [...new Set(urls.filter(Boolean))]) {
    const sprite = await downloadSprite(url);
    if (sprite) return sprite;
  }
  return null;
}

function spriteStem(form) {
  if (form.is_default === "1") return form.pokemon_id;
  if (!form.form_identifier) return null;
  return `${form.pokemon_id}-${form.form_identifier}`;
}

function explicitGender(form) {
  const tokens = String(form.form_identifier || "").toLowerCase().split("-");
  if (tokens.includes("female")) return "female";
  if (tokens.includes("male")) return "male";
  return "";
}

function speciesGender(species) {
  if (species.genderRate === -1) return "genderless";
  if (species.genderRate === 0) return "male";
  if (species.genderRate === 8) return "female";
  return "mixed";
}

function localizedValues(map, id, fallback = "") {
  const en = map.get(`${id}:${LANGUAGES.en}`) || fallback;
  return Object.fromEntries(
    Object.entries(LANGUAGES).map(([language, languageId]) => [
      language,
      map.get(`${id}:${languageId}`) || en || fallback
    ])
  );
}

function localizedFormNames(form, namesByForm) {
  const fallback = form.form_identifier ? titleCase(form.form_identifier) : "";
  const english = namesByForm.get(`${form.id}:${LANGUAGES.en}`);
  const englishLabel = english?.form_name || english?.pokemon_name || fallback;
  return Object.fromEntries(
    Object.entries(LANGUAGES).map(([language, languageId]) => {
      const localized = namesByForm.get(`${form.id}:${languageId}`);
      return [language, localized?.form_name || localized?.pokemon_name || englishLabel];
    })
  );
}

function gendersForForm(species, form, explicitBySpecies) {
  const explicit = explicitGender(form);
  if (explicit) return [explicit];

  const availability = speciesGender(species);
  if (availability !== "mixed") return [availability];

  const explicitSet = explicitBySpecies.get(species.id);
  if (form.is_default === "1" && explicitSet?.has("female") && !explicitSet.has("male")) return ["male"];
  if (form.is_default === "1" && explicitSet?.has("male") && !explicitSet.has("female")) return ["female"];
  return ["male", "female"];
}

function candidateKey(species, form, gender) {
  const explicit = explicitGender(form);
  const suffix = gender === "female" && speciesGender(species) === "mixed" && !explicit
    ? "female"
    : "default";
  return `${species.id}:${form.id}:${suffix}`;
}

function spriteUrls(form, species, gender, shiny) {
  const stem = spriteStem(form);
  if (!stem) return [];
  const root = shiny ? `${SPRITE_BASE}/shiny` : SPRITE_BASE;
  const standard = `${root}/${stem}.png`;
  const canUseFemaleSprite =
    gender === "female"
    && species.hasGenderDifferences
    && form.is_default === "1"
    && !explicitGender(form);
  return canUseFemaleSprite ? [`${root}/female/${stem}.png`, standard] : [standard];
}

async function buildAtlas(visuals, kind, atlasIndex) {
  const start = atlasIndex * ATLAS_CAPACITY;
  const slice = visuals.slice(start, start + ATLAS_CAPACITY);
  const composites = await Promise.all(slice.map(async (visual, index) => {
    const buffer = kind === "normal" ? visual.normalBuffer : visual.shinyBuffer;
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

console.log("Téléchargement des tables Pokédex multilingues…");
const csvContents = await mapLimit(CSV_FILES, CSV_FILES.length, async file => {
  const response = await fetchWithRetry(`${CSV_BASE}/${file}`);
  return [file, parseCsv(await response.text())];
});
const tables = Object.fromEntries(csvContents);

const pokemonById = new Map(tables["pokemon.csv"].map(row => [Number(row.id), row]));
const speciesRows = tables["pokemon_species.csv"].map(row => ({
  ...row,
  id: Number(row.id),
  generationId: Number(row.generation_id),
  genderRate: Number(row.gender_rate),
  hasGenderDifferences: row.has_gender_differences === "1"
}));
const speciesById = new Map(speciesRows.map(row => [row.id, row]));

const supportedLanguageIds = new Set(Object.values(LANGUAGES));
const speciesNames = new Map(
  tables["pokemon_species_names.csv"]
    .filter(row => supportedLanguageIds.has(Number(row.local_language_id)))
    .map(row => [`${row.pokemon_species_id}:${row.local_language_id}`, row.name])
);
const namesByForm = new Map(
  tables["pokemon_form_names.csv"]
    .filter(row => supportedLanguageIds.has(Number(row.local_language_id)))
    .map(row => [`${row.pokemon_form_id}:${row.local_language_id}`, row])
);
const typeIdentifierById = new Map(
  tables["types.csv"].map(row => [Number(row.id), row.identifier])
);
const localizedTypeName = new Map(
  tables["type_names.csv"]
    .filter(row => supportedLanguageIds.has(Number(row.local_language_id)))
    .map(row => [`${row.type_id}:${row.local_language_id}`, row.name])
);
const typesByPokemon = new Map();
for (const row of tables["pokemon_types.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const list = typesByPokemon.get(pokemonId) || [];
  list.push({
    slot: Number(row.slot),
    identifier: typeIdentifierById.get(Number(row.type_id)) || `type-${row.type_id}`
  });
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

const explicitBySpecies = new Map();
for (const form of eligibleForms) {
  const pokemon = pokemonById.get(Number(form.pokemon_id));
  const gender = explicitGender(form);
  if (!pokemon || !gender) continue;
  const speciesId = Number(pokemon.species_id);
  const set = explicitBySpecies.get(speciesId) || new Set();
  set.add(gender);
  explicitBySpecies.set(speciesId, set);
}

const candidates = [];
for (const form of eligibleForms) {
  const pokemon = pokemonById.get(Number(form.pokemon_id));
  const species = speciesById.get(Number(pokemon.species_id));
  if (!spriteStem(form)) continue;

  const names = localizedValues(speciesNames, species.id, titleCase(species.identifier));
  const formNames = explicitGender(form)
    ? Object.fromEntries(Object.keys(LANGUAGES).map(language => [language, ""]))
    : localizedFormNames(form, namesByForm);
  const types = (typesByPokemon.get(Number(form.pokemon_id)) || [])
    .sort((a, b) => a.slot - b.slot)
    .map(type => type.identifier);

  for (const gender of gendersForForm(species, form, explicitBySpecies)) {
    candidates.push({
      key: candidateKey(species, form, gender),
      speciesId: species.id,
      slug: species.identifier,
      names,
      generation: species.generationId,
      gender,
      genderAvailability: speciesGender(species),
      pokemonId: Number(form.pokemon_id),
      formId: Number(form.id),
      formOrder: Number(form.order),
      isDefault: form.is_default === "1",
      formNames,
      types,
      normalUrls: spriteUrls(form, species, gender, false),
      shinyUrls: spriteUrls(form, species, gender, true)
    });
  }
}

console.log(`Téléchargement de ${candidates.length} combinaisons forme/sexe…`);
let completed = 0;
const downloaded = await mapLimit(candidates, 36, async candidate => {
  const [normalBuffer, shinyBuffer] = await Promise.all([
    downloadFirst(candidate.normalUrls),
    downloadFirst(candidate.shinyUrls)
  ]);
  completed += 1;
  if (completed % 100 === 0 || completed === candidates.length) {
    process.stdout.write(`\r${completed}/${candidates.length}`);
  }
  if (!normalBuffer || !shinyBuffer) return null;
  return { ...candidate, normalBuffer, shinyBuffer, visualHash: hashPair(normalBuffer, shinyBuffer) };
});
process.stdout.write("\n");

// Deux sexes identiques restent deux entrées de collection, mais deux formes
// strictement identiques pour un même sexe ne sont pas proposées deux fois.
const appearances = [];
const seenBySpeciesAndGender = new Map();
for (const candidate of downloaded.filter(Boolean)) {
  const identity = `${candidate.speciesId}:${candidate.gender}`;
  const seen = seenBySpeciesAndGender.get(identity) || new Set();
  if (seen.has(candidate.visualHash)) continue;
  seen.add(candidate.visualHash);
  seenBySpeciesAndGender.set(identity, seen);
  appearances.push(candidate);
}

// Les sprites identiques sont stockés une seule fois dans les planches, même si
// les deux sexes doivent pouvoir être enregistrés séparément.
const visuals = [];
const visualIndexByHash = new Map();
for (const appearance of appearances) {
  if (!visualIndexByHash.has(appearance.visualHash)) {
    visualIndexByHash.set(appearance.visualHash, visuals.length);
    visuals.push({
      normalBuffer: appearance.normalBuffer,
      shinyBuffer: appearance.shinyBuffer
    });
  }
}

for (const file of await readdir(ASSET_DIR)) {
  if (/^sprites-(normal|shiny)-\d+\.webp$/.test(file)) {
    await rm(resolve(ASSET_DIR, file));
  }
}

const atlasCount = Math.ceil(visuals.length / ATLAS_CAPACITY);
console.log(`Création de ${atlasCount * 2} planches de sprites WebP…`);
for (let atlasIndex = 0; atlasIndex < atlasCount; atlasIndex += 1) {
  await Promise.all([
    buildAtlas(visuals, "normal", atlasIndex),
    buildAtlas(visuals, "shiny", atlasIndex)
  ]);
}

const visualHashesBySpecies = new Map();
for (const entry of appearances) {
  const hashes = visualHashesBySpecies.get(entry.speciesId) || new Set();
  hashes.add(entry.visualHash);
  visualHashesBySpecies.set(entry.speciesId, hashes);
}

const entries = appearances.map(entry => {
  const visualIndex = visualIndexByHash.get(entry.visualHash);
  return {
    key: entry.key,
    speciesId: entry.speciesId,
    slug: entry.slug,
    names: entry.names,
    name: entry.names.fr,
    generation: entry.generation,
    gender: entry.gender,
    genderAvailability: entry.genderAvailability,
    formId: entry.formId,
    isDefault: entry.isDefault,
    formNames: entry.formNames,
    label: entry.formNames.fr,
    types: entry.types,
    variant: visualHashesBySpecies.get(entry.speciesId).size > 1,
    visualVariantCount: visualHashesBySpecies.get(entry.speciesId).size,
    sheet: Math.floor(visualIndex / ATLAS_CAPACITY),
    slot: visualIndex % ATLAS_CAPACITY
  };
});

const usedTypes = [...new Set(entries.flatMap(entry => entry.types))].sort();
const typeNames = Object.fromEntries(usedTypes.map(identifier => {
  const typeId = [...typeIdentifierById].find(([, value]) => value === identifier)?.[0];
  return [
    identifier,
    Object.fromEntries(Object.entries(LANGUAGES).map(([language, languageId]) => [
      language,
      localizedTypeName.get(`${typeId}:${languageId}`)
        || localizedTypeName.get(`${typeId}:${LANGUAGES.en}`)
        || titleCase(identifier)
    ]))
  ];
}));

const generations = [...new Set(speciesRows.map(species => species.generationId))].sort((a, b) => a - b);
const payload = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  languages: Object.keys(LANGUAGES),
  speciesCount: speciesRows.length,
  appearanceCount: entries.length,
  visualCount: visuals.length,
  cellSize: CELL_SIZE,
  atlasColumns: ATLAS_COLUMNS,
  atlasSize: ATLAS_SIZE,
  normalSheets: Array.from({ length: atlasCount }, (_, index) => `assets/sprites-normal-${index}.webp`),
  shinySheets: Array.from({ length: atlasCount }, (_, index) => `assets/sprites-shiny-${index}.webp`),
  generations,
  types: usedTypes,
  typeNames,
  entries
};

const javascript = `/* Généré par tools/update-data.mjs — ne pas modifier manuellement. */\nwindow.SHINYDEX_DATA = ${JSON.stringify(payload)};\n`;
await writeFile(DATA_FILE, javascript);

console.log(
  `Base générée : ${payload.speciesCount} espèces, ${payload.appearanceCount} combinaisons, `
  + `${payload.visualCount} couples de sprites, ${atlasCount} planches normales + ${atlasCount} shiny.`
);
