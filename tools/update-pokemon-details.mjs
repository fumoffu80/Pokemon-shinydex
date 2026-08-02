#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = resolve(ROOT, "data/pokemon-details.js");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const LANGUAGES = { fr: 5, en: 9, es: 7, de: 6, it: 8, ja: 1 };
const FILES = [
  "pokemon.csv",
  "pokemon_forms.csv",
  "pokemon_abilities.csv",
  "ability_names.csv",
  "pokemon_stats.csv",
  "stats.csv",
  "pokemon_species.csv",
  "pokemon_egg_groups.csv",
  "egg_group_prose.csv",
  "types.csv",
  "moves.csv",
  "move_names.csv",
  "items.csv",
  "item_names.csv",
  "item_categories.csv",
  "item_category_prose.csv",
  "natures.csv",
  "nature_names.csv"
];

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

function translationsFor(names, id, fallback) {
  const english = names.get(`${id}:${LANGUAGES.en}`) || fallback;
  return Object.fromEntries(Object.entries(LANGUAGES).map(([language, languageId]) => [
    language,
    names.get(`${id}:${languageId}`) || english
  ]));
}

console.log("Téléchargement des données techniques PokéAPI…");
const loaded = await Promise.all(FILES.map(async file => [file, await fetchCsv(file)]));
const tables = Object.fromEntries(loaded);

const abilityNames = localizedNames(tables["ability_names.csv"], "ability_id");
const eggGroupNames = localizedNames(tables["egg_group_prose.csv"], "egg_group_id");
const moveNames = localizedNames(tables["move_names.csv"], "move_id");
const itemNames = localizedNames(tables["item_names.csv"], "item_id");
const itemCategoryNames = localizedNames(tables["item_category_prose.csv"], "item_category_id");
const natureNames = localizedNames(tables["nature_names.csv"], "nature_id");
const statIdentifierById = new Map(tables["stats.csv"].map(row => [Number(row.id), row.identifier]));
const typeIdentifierById = new Map(tables["types.csv"].map(row => [Number(row.id), row.identifier]));

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
const abilities = Object.fromEntries(abilityIds.map(id => [id, {
  names: translationsFor(abilityNames, id, `Ability ${id}`),
  pokemonIds: [...(pokemonIdsByAbility.get(id) || [])].sort((a, b) => a - b)
}]));

const moves = Object.fromEntries(tables["moves.csv"].map(row => {
  const id = Number(row.id);
  return [id, {
    names: translationsFor(moveNames, id, row.identifier),
    generation: Number(row.generation_id),
    type: typeIdentifierById.get(Number(row.type_id)) || "normal",
    power: Number(row.power) || 0,
    pp: Number(row.pp) || 0,
    accuracy: Number(row.accuracy) || 0,
    priority: Number(row.priority) || 0,
    damageClass: ({ 1: "status", 2: "physical", 3: "special" })[Number(row.damage_class_id)] || "status"
  }];
}));

const categoryIdentifierById = new Map(tables["item_categories.csv"].map(row => [Number(row.id), row.identifier]));
const items = Object.fromEntries(tables["items.csv"].map(row => {
  const id = Number(row.id);
  const categoryId = Number(row.category_id);
  return [id, {
    names: translationsFor(itemNames, id, row.identifier),
    categoryId,
    category: categoryIdentifierById.get(categoryId) || "other",
    categoryNames: translationsFor(itemCategoryNames, categoryId, categoryIdentifierById.get(categoryId) || "Other"),
    cost: Number(row.cost) || 0,
    flingPower: Number(row.fling_power) || 0
  }];
}));

const natures = Object.fromEntries(tables["natures.csv"].map(row => {
  const id = Number(row.id);
  const increasedStat = statIdentifierById.get(Number(row.increased_stat_id)) || "";
  const decreasedStat = statIdentifierById.get(Number(row.decreased_stat_id)) || "";
  return [id, {
    names: translationsFor(natureNames, id, row.identifier),
    increasedStat: increasedStat === decreasedStat ? "" : increasedStat,
    decreasedStat: increasedStat === decreasedStat ? "" : decreasedStat
  }];
}));

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv",
  formPokemonIds,
  pokemon,
  species,
  abilities,
  moves,
  items,
  natures
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `/* Généré par tools/update-pokemon-details.mjs — ne pas modifier manuellement. */\nwindow.SHINYDEX_POKEMON_DETAILS = ${JSON.stringify(payload)};\n`
);
console.log(`${Object.keys(pokemon).length} Pokémon et ${Object.keys(species).length} espèces exportés.`);
