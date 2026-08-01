#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_FILE = resolve(ROOT, "data/pokedex-data.js");
const ASSET_DIR = resolve(ROOT, "assets");
const CACHE_DIR = resolve(ROOT, ".cache/sprites");
const SOURCE_OVERRIDE_DIR = resolve(ROOT, "tools/source-overrides");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const LANGUAGES = { fr: 5, en: 9, es: 7, de: 6, it: 8, ja: 1 };
const CELL_SIZE = 96;
const ATLAS_COLUMNS = 20;
const ATLAS_ROWS = 20;
const ATLAS_CAPACITY = ATLAS_COLUMNS * ATLAS_ROWS;
const ATLAS_SIZE = CELL_SIZE * ATLAS_COLUMNS;
// PokéAPI rattache les motifs de Prismillon à Lépidonille et Pérégrain alors
// que ces deux stades n'ont qu'une seule forme visible et collectionnable.
// On garde toutes les lignes source afin de créer des alias de migration vers
// leur unique forme, sans perdre les quantités déjà enregistrées.
const SINGLE_FORM_PRE_EVOLUTION_SPECIES = new Set([664, 665]);
const SPRITE_SOURCE_OVERRIDES = new Map([
  [10065, {
    normal: "pichu-spiky-eared-normal.png",
    shiny: "pichu-spiky-eared-shiny.png"
  }]
]);
const SPRITE_FALLBACK_FORMS = new Map([
  // Ces formes sont bien référencées par PokéAPI, mais leurs sprites pixel ne
  // sont pas toujours publiés séparément. Poltchageist et Théffroyable
  // utilisent légitimement le même sprite pixel pour leurs deux formes ;
  // seule Méga-Zygarde conserve donc l'indication « provisoire ».
  [10447, { pokemonId: 1012, placeholder: false }], // Poltchageist — Forme Onéreuse
  [10448, { pokemonId: 1013, placeholder: false }], // Théffroyable — Forme Exceptionnelle
  [10526, { pokemonId: 10120, placeholder: true }] // Méga-Zygarde → Zygarde Forme Parfaite
]);
const CUSTOM_FORMS = [
  {
    speciesId: 1017,
    formId: 201701,
    formOrder: 1434,
    sourcePokemonId: 1017,
    formNames: {
      fr: "Téracristallisation — Masque Turquoise",
      en: "Terastallized — Teal Mask",
      es: "Teracristalización — Máscara Turquesa",
      de: "Terakristallisierung — Türkisgrüne Maske",
      it: "Teracristallizzazione — Maschera Turchese",
      ja: "テラスタル — みどりのめん"
    },
    types: ["grass"]
  },
  {
    speciesId: 1017,
    formId: 201702,
    formOrder: 1435,
    sourcePokemonId: 10273,
    formNames: {
      fr: "Téracristallisation — Masque du Puits",
      en: "Terastallized — Wellspring Mask",
      es: "Teracristalización — Máscara Fuente",
      de: "Terakristallisierung — Brunnenmaske",
      it: "Teracristallizzazione — Maschera Pozzo",
      ja: "テラスタル — いどのめん"
    },
    types: ["grass", "water"]
  },
  {
    speciesId: 1017,
    formId: 201703,
    formOrder: 1436,
    sourcePokemonId: 10274,
    formNames: {
      fr: "Téracristallisation — Masque du Fourneau",
      en: "Terastallized — Hearthflame Mask",
      es: "Teracristalización — Máscara Horno",
      de: "Terakristallisierung — Ofenmaske",
      it: "Teracristallizzazione — Maschera Focolare",
      ja: "テラスタル — かまどのめん"
    },
    types: ["grass", "fire"]
  },
  {
    speciesId: 1017,
    formId: 201704,
    formOrder: 1437,
    sourcePokemonId: 10275,
    formNames: {
      fr: "Téracristallisation — Masque de la Pierre",
      en: "Terastallized — Cornerstone Mask",
      es: "Teracristalización — Máscara Cimiento",
      de: "Terakristallisierung — Fundamentmaske",
      it: "Teracristallizzazione — Maschera Fondamenta",
      ja: "テラスタル — いしずえのめん"
    },
    types: ["grass", "rock"]
  }
];
const EXCEPTIONAL_FUSION_FORMS = new Map([
  [646, new Set(["black", "white"])],
  [800, new Set(["dusk", "dawn"])],
  [898, new Set(["ice", "shadow"])]
]);
const EXCEPTIONAL_ITEM_FORMS = new Map([
  [483, new Set(["origin"])],
  [484, new Set(["origin"])],
  [487, new Set(["origin"])],
  [493, new Set([
    "bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying",
    "ghost", "grass", "ground", "ice", "poison", "psychic", "rock", "steel",
    "unknown", "water"
  ])],
  [649, new Set(["burn", "chill", "douse", "shock"])],
  [773, new Set([
    "bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying",
    "ghost", "grass", "ground", "ice", "poison", "psychic", "rock", "steel",
    "water"
  ])],
  [888, new Set(["crowned"])],
  [889, new Set(["crowned"])],
  [1017, new Set(["wellspring-mask", "hearthflame-mask", "cornerstone-mask"])]
]);
const EXCEPTIONAL_TEMPORARY_FORMS = new Map([
  [492, new Set(["sky"])],
  [676, new Set([
    "heart", "star", "diamond", "debutante", "matron", "dandy", "la-reine",
    "kabuki", "pharaoh"
  ])],
  [720, new Set(["unbound"])]
]);

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
    if (sprite) return { buffer: sprite, url };
  }
  return null;
}

async function spriteBuffer(candidate, kind) {
  const override = SPRITE_SOURCE_OVERRIDES.get(candidate.formId)?.[kind];
  if (override) {
    return {
      buffer: await readFile(resolve(SOURCE_OVERRIDE_DIR, override)),
      placeholder: false
    };
  }
  const primary = await downloadFirst(kind === "normal" ? candidate.normalUrls : candidate.shinyUrls);
  if (primary) return { ...primary, placeholder: false };
  const fallback = await downloadFirst(
    kind === "normal" ? candidate.fallbackNormalUrls : candidate.fallbackShinyUrls
  );
  return fallback
    ? { ...fallback, placeholder: candidate.fallbackSpritePlaceholder !== false }
    : null;
}

function spriteStems(form) {
  const stems = [];
  if (form.is_default !== "1" && form.form_identifier) {
    stems.push(`${form.pokemon_id}-${form.form_identifier}`);
  }
  stems.push(form.pokemon_id);
  return [...new Set(stems.filter(Boolean))];
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

function exceptionalReason(species, form) {
  const identifier = String(form.form_identifier || "").toLowerCase();
  const tokens = identifier.split("-");
  if (form.is_mega === "1") return "mega";
  if (tokens.includes("gmax")) return "gigamax";
  if (species.id === 774 && tokens.includes("meteor")) return "battle";
  if (EXCEPTIONAL_FUSION_FORMS.get(species.id)?.has(identifier)) return "fusion";
  if (EXCEPTIONAL_ITEM_FORMS.get(species.id)?.has(identifier)) return "item";
  if (EXCEPTIONAL_TEMPORARY_FORMS.get(species.id)?.has(identifier)) return "temporary";
  if (form.is_battle_only === "1") return "battle";
  return "";
}

function normalizeFormKey(value) {
  return String(value || "default")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "default";
}

function semanticFormKey(candidate) {
  const formName = candidate.formNames?.en || candidate.formNames?.fr || "default";
  const normalizedName = normalizeFormKey(formName);
  const semanticName = normalizedName === "default" && !candidate.explicitGender
    ? normalizeFormKey(candidate.formIdentifier)
    : normalizedName;
  return [
    candidate.speciesId,
    semanticName,
    candidate.types.join("-"),
    candidate.exceptionReason || "standard"
  ].join(":");
}

function spriteUrlsForPokemonId(pokemonId, shiny) {
  const root = shiny ? `${SPRITE_BASE}/shiny` : SPRITE_BASE;
  return [`${root}/${pokemonId}.png`];
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
  const stems = spriteStems(form);
  const root = shiny ? `${SPRITE_BASE}/shiny` : SPRITE_BASE;
  const canUseFemaleSprite =
    gender === "female"
    && species.hasGenderDifferences
    && form.is_default === "1"
    && !explicitGender(form);
  return stems.flatMap(stem => canUseFemaleSprite
    ? [`${root}/female/${stem}.png`, `${root}/${stem}.png`]
    : [`${root}/${stem}.png`]
  );
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
  evolvesFromSpeciesId: Number(row.evolves_from_species_id) || 0,
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
  // Toutes les formes disposant de deux sprites locaux sont candidates, y
  // compris les Méga-Évolutions et Gigamax. Leur nature temporaire est
  // conservée dans les données afin que l’interface les propose en exception.
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
  if (!spriteStems(form).length) continue;

  const names = localizedValues(speciesNames, species.id, titleCase(species.identifier));
  const singleFormPreEvolution = SINGLE_FORM_PRE_EVOLUTION_SPECIES.has(species.id);
  const formNames = explicitGender(form) || singleFormPreEvolution
    ? Object.fromEntries(Object.keys(LANGUAGES).map(language => [language, ""]))
    : localizedFormNames(form, namesByForm);
  const types = (typesByPokemon.get(Number(form.pokemon_id)) || [])
    .sort((a, b) => a.slot - b.slot)
    .map(type => type.identifier);

  for (const gender of gendersForForm(species, form, explicitBySpecies)) {
    const fallbackForm = SPRITE_FALLBACK_FORMS.get(Number(form.id));
    const fallbackPokemonId = fallbackForm?.pokemonId;
    const primaryNormalUrls = spriteUrls(form, species, gender, false);
    const primaryShinyUrls = spriteUrls(form, species, gender, true);
    const baseSpriteSuffix = fallbackPokemonId === Number(form.pokemon_id)
      ? `/${form.pokemon_id}.png`
      : "";
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
      formIdentifier: singleFormPreEvolution ? "" : form.form_identifier,
      explicitGender: explicitGender(form),
      formOrder: Number(form.order),
      isDefault: form.is_default === "1",
      exceptional: Boolean(exceptionalReason(species, form)),
      exceptionReason: exceptionalReason(species, form),
      formNames,
      types,
      normalUrls: baseSpriteSuffix
        ? primaryNormalUrls.filter(url => !url.endsWith(baseSpriteSuffix))
        : primaryNormalUrls,
      shinyUrls: baseSpriteSuffix
        ? primaryShinyUrls.filter(url => !url.endsWith(baseSpriteSuffix))
        : primaryShinyUrls,
      fallbackNormalUrls: fallbackPokemonId
        ? spriteUrlsForPokemonId(fallbackPokemonId, false)
        : [],
      fallbackShinyUrls: fallbackPokemonId
        ? spriteUrlsForPokemonId(fallbackPokemonId, true)
        : [],
      fallbackSpritePlaceholder: fallbackForm?.placeholder ?? true
    });
  }
}

for (const custom of CUSTOM_FORMS) {
  const species = speciesById.get(custom.speciesId);
  if (!species) continue;
  const names = localizedValues(speciesNames, species.id, titleCase(species.identifier));
  candidates.push({
    key: `${species.id}:${custom.formId}:default`,
    speciesId: species.id,
    slug: species.identifier,
    names,
    generation: species.generationId,
    gender: speciesGender(species),
    genderAvailability: speciesGender(species),
    pokemonId: custom.sourcePokemonId,
    formId: custom.formId,
    formIdentifier: `terastallized-${custom.formId}`,
    explicitGender: "",
    formOrder: custom.formOrder,
    isDefault: false,
    exceptional: true,
    exceptionReason: "battle",
    formNames: custom.formNames,
    types: custom.types,
    normalUrls: [],
    shinyUrls: [],
    fallbackNormalUrls: spriteUrlsForPokemonId(custom.sourcePokemonId, false),
    fallbackShinyUrls: spriteUrlsForPokemonId(custom.sourcePokemonId, true),
    fallbackSpritePlaceholder: true
  });
}

console.log(`Téléchargement de ${candidates.length} combinaisons forme/sexe…`);
let completed = 0;
const downloaded = await mapLimit(candidates, 36, async candidate => {
  const [normalResult, shinyResult] = await Promise.all([
    spriteBuffer(candidate, "normal"),
    spriteBuffer(candidate, "shiny")
  ]);
  completed += 1;
  if (completed % 100 === 0 || completed === candidates.length) {
    process.stdout.write(`\r${completed}/${candidates.length}`);
  }
  if (!normalResult?.buffer || !shinyResult?.buffer) return null;
  return {
    ...candidate,
    normalBuffer: normalResult.buffer,
    shinyBuffer: shinyResult.buffer,
    spritePlaceholder: normalResult.placeholder || shinyResult.placeholder,
    visualHash: hashPair(normalResult.buffer, shinyResult.buffer)
  };
});
process.stdout.write("\n");

// Deux sexes identiques restent deux entrées de collection. Les doublons
// techniques (notamment les variantes de talent de Zygarde) sont regroupés
// selon leur forme sémantique, même si PokéAPI publie plusieurs fichiers.
const appearances = [];
const appearanceBySemanticKey = new Map();
const keyAliases = {};
for (const candidate of downloaded.filter(Boolean)) {
  candidate.formKey = semanticFormKey(candidate);
  const identity = `${candidate.formKey}:${candidate.gender}`;
  const existing = appearanceBySemanticKey.get(identity);
  if (existing) {
    keyAliases[candidate.key] = existing.key;
    continue;
  }
  appearanceBySemanticKey.set(identity, candidate);
  appearances.push(candidate);
}

const formOrderByKey = new Map();
for (const appearance of appearances) {
  formOrderByKey.set(
    appearance.formKey,
    Math.min(formOrderByKey.get(appearance.formKey) ?? Number.POSITIVE_INFINITY, appearance.formOrder)
  );
}
const genderOrder = { male: 0, female: 1, genderless: 2 };
appearances.sort((a, b) =>
  a.speciesId - b.speciesId
  || formOrderByKey.get(a.formKey) - formOrderByKey.get(b.formKey)
  || a.formKey.localeCompare(b.formKey, "en")
  || genderOrder[a.gender] - genderOrder[b.gender]
  || a.formOrder - b.formOrder
  || a.formId - b.formId
);

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

const displayKeysBySpecies = new Map();
for (const entry of appearances) {
  entry.displayKey = `${entry.formKey}:${entry.visualHash}`;
  const displayKeys = displayKeysBySpecies.get(entry.speciesId) || new Set();
  displayKeys.add(entry.displayKey);
  displayKeysBySpecies.set(entry.speciesId, displayKeys);
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
    formOrder: formOrderByKey.get(entry.formKey),
    formKey: entry.formKey,
    displayKey: entry.displayKey,
    isDefault: entry.isDefault,
    exceptional: entry.exceptional,
    exceptionReason: entry.exceptionReason,
    spritePlaceholder: Boolean(entry.spritePlaceholder),
    formNames: entry.formNames,
    label: entry.formNames.fr,
    types: entry.types,
    variant: displayKeysBySpecies.get(entry.speciesId).size > 1,
    visualVariantCount: displayKeysBySpecies.get(entry.speciesId).size,
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
const evolutions = speciesRows
  .filter(species => species.evolvesFromSpeciesId)
  .map(species => ({ from: species.evolvesFromSpeciesId, to: species.id }));
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
  evolutions,
  keyAliases,
  entries
};

const javascript = `/* Généré par tools/update-data.mjs — ne pas modifier manuellement. */\nwindow.SHINYDEX_DATA = ${JSON.stringify(payload)};\n`;
await writeFile(DATA_FILE, javascript);

console.log(
  `Base générée : ${payload.speciesCount} espèces, ${payload.appearanceCount} combinaisons, `
  + `${payload.visualCount} couples de sprites, ${atlasCount} planches normales + ${atlasCount} shiny.`
);
