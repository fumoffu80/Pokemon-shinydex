#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(ROOT, "data/pokemon-details.js");
const TECHNICAL_EFFECTS_OUTPUT = resolve(ROOT, "data/technical-effects.js");
const CONQUEST_ABILITY_EFFECTS = resolve(ROOT, "tools/source-overrides/conquest-ability-effects.json");
const MOVE_EFFECT_OVERRIDES = resolve(ROOT, "tools/source-overrides/move-effects.json");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const LANGUAGES = { fr: 5, en: 9, es: 7, de: 6, it: 8, ja: 1 };
const FILES = [
  "pokemon.csv",
  "pokemon_forms.csv",
  "pokemon_abilities.csv",
  "abilities.csv",
  "ability_names.csv",
  "ability_prose.csv",
  "ability_flavor_text.csv",
  "pokemon_stats.csv",
  "stats.csv",
  "pokemon_species.csv",
  "pokemon_egg_groups.csv",
  "egg_group_prose.csv",
  "types.csv",
  "moves.csv",
  "move_names.csv",
  "move_effect_prose.csv",
  "move_flavor_text.csv",
  "pokemon_moves.csv",
  "pokemon_move_methods.csv",
  "pokemon_move_method_prose.csv",
  "version_groups.csv",
  "versions.csv",
  "version_names.csv",
  "pokemon_game_indices.csv",
  "encounters.csv",
  "encounter_slots.csv",
  "encounter_methods.csv",
  "encounter_method_prose.csv",
  "location_areas.csv",
  "location_area_prose.csv",
  "locations.csv",
  "location_names.csv",
  "natures.csv",
  "nature_names.csv"
];

const EXCLUDED_VERSION_IDS = new Set([19, 20, 49]); // Colosseum, XD et Champions ne sont pas des jeux principaux capturables demandés.
const EXCLUDED_VERSION_GROUP_IDS = new Set([12, 13, 32]);

const CUSTOM_FORM_POKEMON = {
  201701: 1017,
  201702: 10273,
  201703: 10274,
  201704: 10275
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter(values => values.some(Boolean))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function fetchCsv(file, attempts = 4) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${CSV_BASE}/${file}`, {
        headers: { "User-Agent": "pokemon-shinydex-details-builder" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return parseCsv(await response.text());
    } catch (caught) {
      error = caught;
      if (attempt < attempts) await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 500));
    }
  }
  throw new Error(`${file}: ${error?.message || "téléchargement impossible"}`);
}

function localizedNames(rows, idField, valueField = "name") {
  const supported = new Set(Object.values(LANGUAGES));
  const names = new Map();
  for (const row of rows) {
    const languageId = Number(row.local_language_id);
    if (!supported.has(languageId)) continue;
    names.set(`${row[idField]}:${languageId}`, row[valueField]);
  }
  return names;
}

function localizedProse(rows, idField, valueField) {
  return localizedNames(rows, idField, valueField);
}

function translationsFor(names, id, fallback) {
  const english = names.get(`${id}:${LANGUAGES.en}`) || fallback;
  return Object.fromEntries(Object.entries(LANGUAGES).map(([language, languageId]) => [
    language,
    names.get(`${id}:${languageId}`) || english
  ]));
}

function localizedLatestText(rows, idField, orderField, valueField) {
  const supported = new Set(Object.values(LANGUAGES));
  const values = new Map();
  for (const row of rows) {
    const languageId = Number(row.language_id || row.local_language_id);
    if (!supported.has(languageId)) continue;
    const key = `${row[idField]}:${languageId}`;
    const order = Number(row[orderField]) || 0;
    const previous = values.get(key);
    if (!previous || order >= previous.order) values.set(key, { order, value: row[valueField] });
  }
  return new Map([...values].map(([key, record]) => [key, record.value]));
}

function cleanTechnicalText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function technicalTranslations(sources, override = {}) {
  const exact = language => sources
    .map(source => cleanTechnicalText(source.map.get(`${source.id}:${LANGUAGES[language]}`)))
    .find(Boolean) || cleanTechnicalText(override[language]);
  const english = exact("en") || Object.values(override).map(cleanTechnicalText).find(Boolean) || "";
  return Object.fromEntries(Object.keys(LANGUAGES).map(language => [language, exact(language) || english]));
}

console.log("Téléchargement des données techniques PokéAPI…");
const loaded = await Promise.all(FILES.map(async file => [file, await fetchCsv(file)]));
const tables = Object.fromEntries(loaded);
const conquestAbilityEffects = JSON.parse(await readFile(CONQUEST_ABILITY_EFFECTS, "utf8"));
const moveEffectOverrides = JSON.parse(await readFile(MOVE_EFFECT_OVERRIDES, "utf8"));

const abilityNames = localizedNames(tables["ability_names.csv"], "ability_id");
const abilityShortEffects = localizedProse(tables["ability_prose.csv"], "ability_id", "short_effect");
const abilityEffects = localizedProse(tables["ability_prose.csv"], "ability_id", "effect");
const abilityFlavorTexts = localizedLatestText(tables["ability_flavor_text.csv"], "ability_id", "version_group_id", "flavor_text");
const eggGroupNames = localizedNames(tables["egg_group_prose.csv"], "egg_group_id");
const moveNames = localizedNames(tables["move_names.csv"], "move_id");
const moveShortEffects = localizedProse(tables["move_effect_prose.csv"], "move_effect_id", "short_effect");
const moveEffects = localizedProse(tables["move_effect_prose.csv"], "move_effect_id", "effect");
const moveFlavorTexts = localizedLatestText(tables["move_flavor_text.csv"], "move_id", "version_group_id", "flavor_text");
const moveMethodNames = localizedNames(tables["pokemon_move_method_prose.csv"], "pokemon_move_method_id");
const moveMethodDescriptions = localizedProse(tables["pokemon_move_method_prose.csv"], "pokemon_move_method_id", "description");
const versionNames = localizedNames(tables["version_names.csv"], "version_id");
const encounterMethodNames = localizedNames(tables["encounter_method_prose.csv"], "encounter_method_id");
const locationAreaNames = localizedNames(tables["location_area_prose.csv"], "location_area_id");
const locationNames = localizedNames(tables["location_names.csv"], "location_id");
const natureNames = localizedNames(tables["nature_names.csv"], "nature_id");
const statIdentifierById = new Map(tables["stats.csv"].map(row => [Number(row.id), row.identifier]));
const typeIdentifierById = new Map(tables["types.csv"].map(row => [Number(row.id), row.identifier]));
const abilityGenerationById = new Map(tables["abilities.csv"].map(row => [Number(row.id), Number(row.generation_id)]));
const versionGroupById = new Map(tables["version_groups.csv"].map(row => [Number(row.id), row]));

const statsByPokemon = new Map();
for (const row of tables["pokemon_stats.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const stats = statsByPokemon.get(pokemonId) || {};
  stats[statIdentifierById.get(Number(row.stat_id)) || row.stat_id] = Number(row.base_stat);
  statsByPokemon.set(pokemonId, stats);
}

const abilitiesByPokemon = new Map();
const pokemonIdsByAbility = new Map();
for (const row of tables["pokemon_abilities.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const abilityId = Number(row.ability_id);
  const abilities = abilitiesByPokemon.get(pokemonId) || [];
  abilities.push({
    id: abilityId,
    slot: Number(row.slot),
    hidden: row.is_hidden === "1",
    names: translationsFor(abilityNames, abilityId, `Ability ${abilityId}`)
  });
  abilitiesByPokemon.set(pokemonId, abilities);
  const pokemonIds = pokemonIdsByAbility.get(abilityId) || new Set();
  pokemonIds.add(pokemonId);
  pokemonIdsByAbility.set(abilityId, pokemonIds);
}

const eggGroupsBySpecies = new Map();
for (const row of tables["pokemon_egg_groups.csv"]) {
  const speciesId = Number(row.species_id);
  const eggGroupId = Number(row.egg_group_id);
  const groups = eggGroupsBySpecies.get(speciesId) || [];
  groups.push({
    id: eggGroupId,
    names: translationsFor(eggGroupNames, eggGroupId, `Group ${eggGroupId}`)
  });
  eggGroupsBySpecies.set(speciesId, groups);
}

const pokemon = {};
for (const row of tables["pokemon.csv"]) {
  const id = Number(row.id);
  pokemon[id] = {
    speciesId: Number(row.species_id),
    height: Number(row.height),
    weight: Number(row.weight),
    baseExperience: Number(row.base_experience) || 0,
    stats: statsByPokemon.get(id) || {},
    abilities: (abilitiesByPokemon.get(id) || []).sort((a, b) => a.slot - b.slot)
  };
}

const species = {};
for (const row of tables["pokemon_species.csv"]) {
  const id = Number(row.id);
  species[id] = {
    genderRate: Number(row.gender_rate),
    captureRate: Number(row.capture_rate),
    hatchCounter: Number(row.hatch_counter),
    legendary: row.is_legendary === "1",
    mythical: row.is_mythical === "1",
    baby: row.is_baby === "1",
    eggGroups: eggGroupsBySpecies.get(id) || []
  };
}

const formPokemonIds = Object.fromEntries(tables["pokemon_forms.csv"].map(row => [
  Number(row.id),
  Number(row.pokemon_id)
]));
Object.assign(formPokemonIds, CUSTOM_FORM_POKEMON);

const abilityIds = [...new Set(tables["ability_names.csv"].map(row => Number(row.ability_id)))];
const abilityTechnicalEffects = {};
const abilities = Object.fromEntries(abilityIds.map(id => {
  const shortEffects = translationsFor(abilityShortEffects, id, "");
  const effects = translationsFor(abilityEffects, id, "");
  if (!shortEffects.fr) {
    abilityTechnicalEffects[id] = {
      sourceGame: id >= 10001 ? "pokemon-conquest" : "",
      shortEffects: technicalTranslations([
        { map: abilityShortEffects, id },
        { map: abilityFlavorTexts, id },
        { map: abilityEffects, id }
      ], conquestAbilityEffects.abilities?.[id]),
      effects: technicalTranslations([
        { map: abilityEffects, id },
        { map: abilityFlavorTexts, id },
        { map: abilityShortEffects, id }
      ], conquestAbilityEffects.abilities?.[id])
    };
  }
  return [id, {
    names: translationsFor(abilityNames, id, `Ability ${id}`),
    generation: abilityGenerationById.get(id) || 0,
    shortEffects,
    effects,
    pokemonIds: [...(pokemonIdsByAbility.get(id) || [])].sort((a, b) => a - b)
  }];
}));

const moveTechnicalEffects = {};
const moves = Object.fromEntries(tables["moves.csv"].map(row => {
  const id = Number(row.id);
  const effectId = Number(row.effect_id);
  const shortEffects = translationsFor(moveShortEffects, effectId, "");
  const effects = translationsFor(moveEffects, effectId, "");
  if (!shortEffects.fr) {
    moveTechnicalEffects[id] = {
      shortEffects: technicalTranslations([
        { map: moveShortEffects, id: effectId },
        { map: moveFlavorTexts, id },
        { map: moveEffects, id: effectId }
      ], moveEffectOverrides.moves?.[id]),
      effects: technicalTranslations([
        { map: moveEffects, id: effectId },
        { map: moveFlavorTexts, id },
        { map: moveShortEffects, id: effectId }
      ], moveEffectOverrides.moves?.[id])
    };
  }
  return [id, {
    names: translationsFor(moveNames, id, row.identifier),
    generation: Number(row.generation_id),
    type: typeIdentifierById.get(Number(row.type_id)) || "normal",
    power: Number(row.power) || 0,
    pp: Number(row.pp) || 0,
    accuracy: Number(row.accuracy) || 0,
    priority: Number(row.priority) || 0,
    damageClass: ({ 1: "status", 2: "physical", 3: "special" })[Number(row.damage_class_id)] || "status",
    effectChance: Number(row.effect_chance) || 0,
    shortEffects,
    effects
  }];
}));

const moveMethods = Object.fromEntries(tables["pokemon_move_methods.csv"].map(row => {
  const id = Number(row.id);
  return [id, {
    identifier: row.identifier,
    names: translationsFor(moveMethodNames, id, row.identifier),
    descriptions: translationsFor(moveMethodDescriptions, id, "")
  }];
}));

const versions = Object.fromEntries(tables["versions.csv"]
  .filter(row => !EXCLUDED_VERSION_IDS.has(Number(row.id)))
  .map(row => {
    const id = Number(row.id);
    const versionGroupId = Number(row.version_group_id);
    return [id, {
      identifier: row.identifier,
      versionGroupId,
      generation: Number(versionGroupById.get(versionGroupId)?.generation_id) || 0,
      names: translationsFor(versionNames, id, row.identifier)
    }];
  }));

const versionGroups = Object.fromEntries(tables["version_groups.csv"]
  .filter(row => !EXCLUDED_VERSION_GROUP_IDS.has(Number(row.id)))
  .map(row => {
    const id = Number(row.id);
    return [id, {
      identifier: row.identifier,
      generation: Number(row.generation_id),
      order: Number(row.order),
      versionIds: tables["versions.csv"]
        .filter(version => Number(version.version_group_id) === id && !EXCLUDED_VERSION_IDS.has(Number(version.id)))
        .map(version => Number(version.id))
    }];
  }));

const gameVersionIdsByPokemon = new Map();
for (const row of tables["pokemon_game_indices.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const versionId = Number(row.version_id);
  if (!versions[versionId]) continue;
  const ids = gameVersionIdsByPokemon.get(pokemonId) || new Set();
  ids.add(versionId);
  gameVersionIdsByPokemon.set(pokemonId, ids);
}

const learnsetsByPokemon = new Map();
const learnsetDeduplication = new Set();
for (const row of tables["pokemon_moves.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const versionGroupId = Number(row.version_group_id);
  if (!versionGroups[versionGroupId]) continue;
  const packed = [
    Number(row.move_id),
    Number(row.pokemon_move_method_id),
    Number(row.level) || 0,
    Number(row.mastery) || 0
  ];
  const uniqueKey = `${pokemonId}:${versionGroupId}:${packed.join(":")}`;
  if (learnsetDeduplication.has(uniqueKey)) continue;
  learnsetDeduplication.add(uniqueKey);
  const byVersion = learnsetsByPokemon.get(pokemonId) || new Map();
  const rows = byVersion.get(versionGroupId) || [];
  rows.push(packed);
  byVersion.set(versionGroupId, rows);
  learnsetsByPokemon.set(pokemonId, byVersion);
}

for (const [pokemonId, byVersion] of learnsetsByPokemon) {
  const record = pokemon[pokemonId];
  if (!record) continue;
  record.learnsets = Object.fromEntries([...byVersion].map(([versionGroupId, rows]) => [
    versionGroupId,
    rows.sort((left, right) => left[1] - right[1] || left[2] - right[2] || left[0] - right[0])
  ]));
}
for (const [pokemonId, versionIds] of gameVersionIdsByPokemon) {
  if (pokemon[pokemonId]) pokemon[pokemonId].gameVersionIds = [...versionIds].sort((a, b) => a - b);
}

const encounterMethods = Object.fromEntries(tables["encounter_methods.csv"].map(row => {
  const id = Number(row.id);
  return [id, { identifier: row.identifier, names: translationsFor(encounterMethodNames, id, row.identifier) }];
}));
const encounterSlotById = new Map(tables["encounter_slots.csv"].map(row => [Number(row.id), {
  methodId: Number(row.encounter_method_id),
  rarity: Number(row.rarity) || 0
}]));
const locationById = new Map(tables["locations.csv"].map(row => [Number(row.id), row]));
const locationAreaById = new Map(tables["location_areas.csv"].map(row => [Number(row.id), row]));
const usedLocationAreaIds = new Set();
const encountersByPokemon = new Map();
for (const row of tables["encounters.csv"]) {
  const pokemonId = Number(row.pokemon_id);
  const versionId = Number(row.version_id);
  if (!versions[versionId]) continue;
  const areaId = Number(row.location_area_id);
  const slot = encounterSlotById.get(Number(row.encounter_slot_id));
  if (!slot) continue;
  usedLocationAreaIds.add(areaId);
  const byVersion = encountersByPokemon.get(pokemonId) || new Map();
  const byArea = byVersion.get(versionId) || new Map();
  const aggregate = byArea.get(areaId) || {
    min: Number(row.min_level) || 0,
    max: Number(row.max_level) || 0,
    methods: new Map()
  };
  aggregate.min = Math.min(aggregate.min || Number(row.min_level), Number(row.min_level) || aggregate.min);
  aggregate.max = Math.max(aggregate.max, Number(row.max_level) || 0);
  aggregate.methods.set(slot.methodId, Math.max(aggregate.methods.get(slot.methodId) || 0, slot.rarity));
  byArea.set(areaId, aggregate);
  byVersion.set(versionId, byArea);
  encountersByPokemon.set(pokemonId, byVersion);
}
for (const [pokemonId, byVersion] of encountersByPokemon) {
  const record = pokemon[pokemonId];
  if (!record) continue;
  record.encounters = Object.fromEntries([...byVersion].map(([versionId, byArea]) => [versionId,
    [...byArea].map(([areaId, aggregate]) => [
      areaId,
      aggregate.min,
      aggregate.max,
      [...aggregate.methods].sort((left, right) => left[0] - right[0])
    ]).sort((left, right) => left[0] - right[0])
  ]));
}

const locations = Object.fromEntries([...usedLocationAreaIds].sort((a, b) => a - b).map(areaId => {
  const area = locationAreaById.get(areaId);
  const locationId = Number(area?.location_id);
  const location = locationById.get(locationId);
  const fallback = area?.identifier || location?.identifier || `Location ${areaId}`;
  const areaTranslations = translationsFor(locationAreaNames, areaId, "");
  const locationTranslations = translationsFor(locationNames, locationId, fallback);
  const names = Object.fromEntries(Object.keys(LANGUAGES).map(language => [
    language,
    [locationTranslations[language], areaTranslations[language]].filter(Boolean).join(" — ") || fallback
  ]));
  return [areaId, { names }];
}));

const natures = Object.fromEntries(tables["natures.csv"].map(row => {
  const id = Number(row.id);
  const increasedStat = statIdentifierById.get(Number(row.increased_stat_id)) || "";
  const decreasedStat = statIdentifierById.get(Number(row.decreased_stat_id)) || "";
  return [id, {
    names: translationsFor(natureNames, id, row.identifier),
    increasedStat,
    decreasedStat,
    neutral: !increasedStat || increasedStat === decreasedStat
  }];
}));

const payload = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: "https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv",
  formPokemonIds,
  pokemon,
  species,
  abilities,
  moves,
  moveMethods,
  versions,
  versionGroups,
  encounterMethods,
  locations,
  natures
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `/* Généré par tools/update-pokemon-details.mjs — ne pas modifier manuellement. */\nwindow.SHINYDEX_POKEMON_DETAILS = ${JSON.stringify(payload)};\n`
);
const technicalEffectsPayload = {
  schemaVersion: 1,
  abilities: abilityTechnicalEffects,
  moves: moveTechnicalEffects
};
await writeFile(
  TECHNICAL_EFFECTS_OUTPUT,
  `/* Généré par tools/update-pokemon-details.mjs — compléments locaux et textes de jeu PokéAPI. */\n(() => {\n  const payload = ${JSON.stringify(technicalEffectsPayload)};\n  const details = window.SHINYDEX_POKEMON_DETAILS;\n  if (details) {\n    for (const [id, effect] of Object.entries(payload.abilities)) Object.assign(details.abilities?.[id] || {}, effect);\n    for (const [id, effect] of Object.entries(payload.moves)) Object.assign(details.moves?.[id] || {}, effect);\n  }\n  window.SHINYDEX_TECHNICAL_EFFECT_OVERRIDES = payload;\n})();\n`
);
console.log(`${Object.keys(pokemon).length} Pokémon et ${Object.keys(species).length} espèces exportés ; ${Object.keys(abilityTechnicalEffects).length} talents et ${Object.keys(moveTechnicalEffects).length} capacités complétés.`);
