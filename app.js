(() => {
  "use strict";

  const DATA = window.SHINYDEX_DATA;
  const I18N = window.SHINYDEX_I18N;
  const AVAILABILITY = window.SHINYDEX_AVAILABILITY || {};
  const DISTRIBUTIONS = window.SHINYDEX_DISTRIBUTIONS || { items: [] };
  const DISTRIBUTION_SOURCE_LOCALES = window.SHINYDEX_DISTRIBUTION_SOURCE_LOCALES?.sources || {};
  const GENDER_DIFFERENCES = window.SHINYDEX_GENDER_DIFFERENCES || {};
  const DETAILS = window.SHINYDEX_POKEMON_DETAILS || { formPokemonIds: {}, pokemon: {}, species: {} };
  if (!DATA?.entries?.length || !I18N?.strings?.fr) {
    document.body.innerHTML = "<p style='padding:2rem'>La base locale du Shinydex est introuvable.</p>";
    return;
  }

  const STORAGE_KEY = "pokemonShinydex:v1";
  const LEGACY_KEYS = ["pokemonShinydex", "shinydex"];
  const EXCEPTION_VALUE = "exception";
  const MAX_QUANTITY = 999;
  const ROTATION_DELAY = 2600;
  const ENABLE_VARIANT_HOVER_OPEN = false;
  const ENABLE_VARIANT_EXIT_CLOSE = false;
  const HOVER_DELAY = 2000;
  const DIALOG_EXIT_DELAY = 2000;
  const SPINDA_ID = 327;
  const GENDER_ORDER = Object.freeze({ male: 0, female: 1, genderless: 2 });
  const EVOLUTION_SOURCE_FORM_REQUIREMENTS = new Map([
    ["52:863", "galar"],
    ["83:865", "galar"],
    ["122:866", "galar"],
    ["194:980", "paldea"],
    ["211:904", "hisui"],
    ["215:903", "hisui"],
    ["222:864", "galar"],
    ["263:862", "galar"],
    ["264:862", "galar"],
    ["550:902", "white striped"],
    ["562:867", "galar"]
  ]);
  const EVOLUTION_SOURCE_FORM_EXCLUSIONS = new Map([
    ["194:195", "paldea"], // Axoloto de Paldea ne devient pas Maraiste
    ["215:461", "hisui"], // Farfuret de Hisui ne devient pas Dimoret
    ["562:563", "galar"] // Tutafeh de Galar ne devient pas Tutankafer
  ]);
  const EVOLUTION_FORM_TRAIT_GROUPS = [
    { species: new Set([412, 413]), values: ["plant", "sandy", "trash"] },
    { species: new Set([422, 423]), values: ["west", "east"] },
    { species: new Set([585, 586]), values: ["spring", "summer", "autumn", "winter"] },
    { species: new Set([669, 670, 671]), values: ["red", "yellow", "orange", "blue", "white"] },
    { species: new Set([710, 711]), values: ["small", "average", "large", "super"] },
    { species: new Set([854, 855]), values: ["phony", "antique"] }
  ];
  const CARD_SIZE_LEVELS = Object.freeze([
    { id: "normal", percent: 100, spriteSize: 96, labelKey: "cardSizeNormal" },
    { id: "large", percent: 125, spriteSize: 120, labelKey: "cardSizeLarge" },
    { id: "xlarge", percent: 150, spriteSize: 144, labelKey: "cardSizeExtraLarge" }
  ]);
  const TYPE_COLORS = {
    normal: "#A8A77A",
    fire: "#EE8130",
    water: "#6390F0",
    electric: "#F7D02C",
    grass: "#7AC74C",
    ice: "#96D9D6",
    fighting: "#C22E28",
    poison: "#A33EA1",
    ground: "#E2BF65",
    flying: "#A98FF3",
    psychic: "#F95587",
    bug: "#A6B91A",
    rock: "#B6A136",
    ghost: "#735797",
    dragon: "#6F35FC",
    dark: "#705746",
    steel: "#B7B7CE",
    fairy: "#D685AD"
  };
  const TYPE_EFFECTIVENESS = Object.freeze({
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
  });
  const HUNT_METHOD_KEYS = Object.freeze([
    "DvTransfer", "Random", "Breeding", "Masuda", "Reset", "Radar", "Horde", "Fishing", "Sos", "Wormhole",
    "CatchCombo", "Dynamax", "Underground", "Research", "Outbreak", "MassiveOutbreak", "Sandwich",
    "Raid", "WildZone", "Distribution", "Other"
  ]);
  const GAME_EDITION_DEFINITIONS = Object.freeze([
    [1, 6, 1996, "Game Boy", "Kanto", "gen1", "#d95151", ["DvTransfer"]],
    [2, 9, 1996, "Game Boy", "Kanto", "gen1", "#4b78c2", ["DvTransfer"]],
    [3, 25, 1998, "Game Boy", "Kanto", "gen1", "#d6b72f", ["DvTransfer"]],
    [4, 250, 1999, "Game Boy Color", "Johto", "gen2", "#d3a63b", ["Random", "Breeding", "Reset"]],
    [5, 249, 1999, "Game Boy Color", "Johto", "gen2", "#aeb8c7", ["Random", "Breeding", "Reset"]],
    [6, 245, 2000, "Game Boy Color", "Johto", "gen2", "#56b8c8", ["Random", "Breeding", "Reset"]],
    [7, 383, 2002, "Game Boy Advance", "Hoenn", "gen3", "#bd4747", ["Random", "Breeding", "Reset"]],
    [8, 382, 2002, "Game Boy Advance", "Hoenn", "gen3", "#416fc6", ["Random", "Breeding", "Reset"]],
    [9, 384, 2004, "Game Boy Advance", "Hoenn", "gen3", "#3f9f70", ["Random", "Breeding", "Reset"]],
    [10, 6, 2004, "Game Boy Advance", "Kanto", "gen3", "#d65e43", ["Random", "Breeding", "Reset"]],
    [11, 3, 2004, "Game Boy Advance", "Kanto", "gen3", "#77a95b", ["Random", "Breeding", "Reset"]],
    [12, 483, 2006, "Nintendo DS", "Sinnoh", "gen4Radar", "#65a6cf", ["Random", "Masuda", "Reset", "Radar"]],
    [13, 484, 2006, "Nintendo DS", "Sinnoh", "gen4Radar", "#d783a9", ["Random", "Masuda", "Reset", "Radar"]],
    [14, 487, 2008, "Nintendo DS", "Sinnoh", "gen4Radar", "#777586", ["Random", "Masuda", "Reset", "Radar"]],
    [15, 250, 2009, "Nintendo DS", "Johto", "gen4", "#c59137", ["Random", "Masuda", "Reset"]],
    [16, 249, 2009, "Nintendo DS", "Johto", "gen4", "#8ca8bd", ["Random", "Masuda", "Reset"]],
    [17, 643, 2010, "Nintendo DS", "Unys", "gen5", "#e6e9ef", ["Random", "Masuda", "Reset"]],
    [18, 644, 2010, "Nintendo DS", "Unys", "gen5", "#343948", ["Random", "Masuda", "Reset"]],
    [21, 646, 2012, "Nintendo DS", "Unys", "gen5", "#4d5058", ["Random", "Masuda", "Reset"]],
    [22, 646, 2012, "Nintendo DS", "Unys", "gen5", "#d6dbe5", ["Random", "Masuda", "Reset"]],
    [23, 716, 2013, "Nintendo 3DS", "Kalos", "gen6Xy", "#5d8ed7", ["Random", "Masuda", "Reset", "Radar", "Horde", "Fishing"]],
    [24, 717, 2013, "Nintendo 3DS", "Kalos", "gen6Xy", "#c84e57", ["Random", "Masuda", "Reset", "Radar", "Horde", "Fishing"]],
    [25, 383, 2014, "Nintendo 3DS", "Hoenn", "gen6Oras", "#c45151", ["Random", "Masuda", "Reset", "Horde", "Fishing"]],
    [26, 382, 2014, "Nintendo 3DS", "Hoenn", "gen6Oras", "#4a72bd", ["Random", "Masuda", "Reset", "Horde", "Fishing"]],
    [27, 791, 2016, "Nintendo 3DS", "Alola", "alola", "#e67d38", ["Random", "Masuda", "Reset", "Sos"]],
    [28, 792, 2016, "Nintendo 3DS", "Alola", "alola", "#665aae", ["Random", "Masuda", "Reset", "Sos"]],
    [29, 800, 2017, "Nintendo 3DS", "Alola", "ultra", "#f09b36", ["Random", "Masuda", "Reset", "Sos", "Wormhole"]],
    [30, 800, 2017, "Nintendo 3DS", "Alola", "ultra", "#785bb5", ["Random", "Masuda", "Reset", "Sos", "Wormhole"]],
    [31, 25, 2018, "Nintendo Switch", "Kanto", "letsGo", "#e2bb35", ["Random", "CatchCombo"]],
    [32, 133, 2018, "Nintendo Switch", "Kanto", "letsGo", "#b98a56", ["Random", "CatchCombo"]],
    [33, 888, 2019, "Nintendo Switch", "Galar", "swsh", "#4f92d3", ["Random", "Masuda", "Reset", "Raid", "Dynamax"]],
    [34, 889, 2019, "Nintendo Switch", "Galar", "swsh", "#d66b83", ["Random", "Masuda", "Reset", "Raid", "Dynamax"]],
    [37, 483, 2021, "Nintendo Switch", "Sinnoh", "bdsp", "#78a6d0", ["Random", "Masuda", "Reset", "Radar", "Underground"]],
    [38, 484, 2021, "Nintendo Switch", "Sinnoh", "bdsp", "#d98eae", ["Random", "Masuda", "Reset", "Radar", "Underground"]],
    [39, 493, 2022, "Nintendo Switch", "Hisui", "arceus", "#83a79d", ["Random", "Research", "Outbreak", "MassiveOutbreak"]],
    [40, 1007, 2022, "Nintendo Switch", "Paldea", "sv", "#c6534a", ["Random", "Masuda", "Reset", "Outbreak", "Sandwich", "Raid"]],
    [41, 1008, 2022, "Nintendo Switch", "Paldea", "sv", "#7959b8", ["Random", "Masuda", "Reset", "Outbreak", "Sandwich", "Raid"]],
    [44, 6, 1996, "Game Boy", "Kanto", "gen1", "#d95151", ["DvTransfer"]],
    [45, 3, 1996, "Game Boy", "Kanto", "gen1", "#67a65d", ["DvTransfer"]],
    [46, 9, 1996, "Game Boy", "Kanto", "gen1", "#4b78c2", ["DvTransfer"]],
    [47, 718, 2025, "Nintendo Switch / Switch 2", "Illumis", "za", "#6d63bd", ["Random", "WildZone"]]
  ].map(([id, mascotSpeciesId, year, platform, region, family, color, methods]) => Object.freeze({
    id, mascotSpeciesId, year, platform, region, family, color, methods: Object.freeze(methods)
  })));
  const GAME_EDITION_BY_ID = new Map(GAME_EDITION_DEFINITIONS.map(game => [game.id, game]));
  const GAME_VERSION_ALIASES = Object.freeze({
    33: [33, 35, 36], 34: [34, 50, 51], 40: [40, 42, 43], 41: [41, 52, 53], 47: [47, 48]
  });
  const STAT_ORDER = Object.freeze(["hp", "attack", "defense", "special-attack", "special-defense", "speed"]);
  const STAT_LABELS = Object.freeze({
    hp: "PV", attack: "Attaque", defense: "Défense", "special-attack": "Att. Spé.", "special-defense": "Déf. Spé.", speed: "Vitesse"
  });

  const elements = Object.fromEntries([
    "metaDescription", "languageFlag", "languageSelect", "searchInput", "generationFilter", "typeFilter",
    "statusFilter", "sortSelect", "pokemonGrid", "pokemonCardTemplate", "variantCardTemplate",
    "ownedCount", "appearanceTotal", "speciesCount", "speciesTotal", "copyCount",
    "progressPercent", "progressBar", "progressMessage", "resultCount", "activeFilter",
    "activeFilterText", "clearFiltersButton", "emptyState", "emptyResetButton",
    "cardSizeButton", "cardSizeValue", "spriteModeButton", "spriteModeValue",
    "settingsButton", "settingsDialog", "animationSetting", "confirmSetting", "openResetButton",
    "resetDialog", "confirmResetButton", "removeDialog", "removeDialogText",
    "confirmRemoveButton", "variantDialog", "variantDialogTitle", "variantGrid",
    "genderDifferenceNote", "genderDifferenceTitle", "genderDifferenceText",
    "closeVariantButton", "exportButton", "importButton", "importInput", "toast", "dataVersion",
    "accountButton", "accountLabel", "cloudStatusLabel", "cloudDot", "authDialog",
    "closeAuthButton", "signedOutPanel", "signedInPanel", "accountEmail", "cloudStatusText",
    "cloudStatusDetail", "dialogCloudDot", "authPassword", "togglePasswordButton",
    "distributionGrid", "distributionEmpty", "distributionUpdatedAt", "distributionCount", "distributionTicker",
    "evolutionSuggestions", "evolutionEmpty", "evolutionCount",
    "evolutionDialog", "evolutionDialogTitle", "evolutionDialogIntro", "evolutionDialogSource",
    "evolutionDialogGrid", "closeEvolutionButton", "lineageButton",
    "explorerButton", "explorerDialog", "closeExplorerButton", "researchDialog", "researchDialogTitle",
    "researchDialogBody", "closeResearchButton", "pokemonInfoDialog", "pokemonInfoTitle", "pokemonInfoBody",
    "closePokemonInfoButton", "huntButton", "activeHuntCount", "huntDialog", "closeHuntButton", "newHuntButton",
    "newCaptureButton", "activeHuntList", "activeHuntEmpty", "huntDialogActiveCount", "captureJournalList",
    "captureJournalEmpty", "captureJournalCount", "huntEditorDialog", "huntEditorForm", "huntEditorTitle",
    "closeHuntEditorButton", "cancelHuntEditorButton", "huntRecordId", "huntRecordMode", "huntEntrySelect",
    "huntGame", "huntMethod", "huntAvailabilityNote", "huntAttempts", "huntDate", "huntDateLabel", "huntNickname", "huntNotes",
    "spoilerSetting"
  ].map(id => [id, document.getElementById(id)]));

  const validKeys = new Set(DATA.entries.map(entry => entry.key));
  const entryByKey = new Map(DATA.entries.map(entry => [entry.key, entry]));
  const unavailableSpeciesIds = new Set(
    (AVAILABILITY.unavailableSpeciesIds || []).map(Number)
  );
  const unavailableFormRules = AVAILABILITY.unavailableForms || [];
  const eligibleEntries = DATA.entries.filter(isLegallyObtainable);
  const eligibleSpeciesIds = new Set(eligibleEntries.map(entry => entry.speciesId));
  const groupsBySpecies = new Map();
  for (const entry of DATA.entries) {
    const group = groupsBySpecies.get(entry.speciesId) || {
      speciesId: entry.speciesId,
      slug: entry.slug,
      generation: entry.generation,
      names: entry.names,
      entries: []
    };
    group.entries.push(entry);
    groupsBySpecies.set(entry.speciesId, group);
  }
  const speciesGroups = [...groupsBySpecies.values()].sort((a, b) => a.speciesId - b.speciesId);
  for (const group of speciesGroups) {
    group.entries.sort((a, b) =>
      (a.formOrder ?? Number.MAX_SAFE_INTEGER) - (b.formOrder ?? Number.MAX_SAFE_INTEGER)
      || String(a.formKey || a.formId).localeCompare(String(b.formKey || b.formId), "en")
      || (GENDER_ORDER[a.gender] ?? 9) - (GENDER_ORDER[b.gender] ?? 9)
      || a.formId - b.formId
    );
    const visualsBySprite = new Map();
    for (const entry of group.entries) {
      const visualKey = entry.displayKey || `${entry.formKey || entry.formId}:${entry.sheet}:${entry.slot}`;
      const visual = visualsBySprite.get(visualKey) || { key: visualKey, entry, entries: [] };
      visual.entries.push(entry);
      visualsBySprite.set(visualKey, visual);
    }
    group.visuals = [...visualsBySprite.values()];
    const forms = new Map();
    for (const entry of group.entries) {
      const formKey = entry.formKey || String(entry.formId);
      const form = forms.get(formKey) || { key: formKey, entry, entries: [] };
      form.entries.push(entry);
      forms.set(formKey, form);
    }
    group.forms = [...forms.values()];
  }
  const groupByEntryKey = new Map(
    speciesGroups.flatMap(group => group.entries.map(entry => [entry.key, group]))
  );
  const primaryEntryBySpecies = new Map(speciesGroups.map(group => [
    group.speciesId,
    group.entries.find(entry => entry.isDefault && !entry.exceptional)
      || group.entries.find(entry => !entry.exceptional)
      || group.entries[0]
  ]));
  const evolutionAdjacency = new Map();
  const evolutionPredecessors = new Map();
  const evolutionNeighbors = new Map();
  for (const edge of DATA.evolutions || []) {
    const from = Number(edge.from);
    const to = Number(edge.to);
    const targets = evolutionAdjacency.get(from) || [];
    targets.push(to);
    evolutionAdjacency.set(from, targets);
    const predecessors = evolutionPredecessors.get(to) || [];
    predecessors.push(from);
    evolutionPredecessors.set(to, predecessors);
    for (const [speciesId, neighbor] of [[from, to], [to, from]]) {
      const neighbors = evolutionNeighbors.get(speciesId) || new Set();
      neighbors.add(neighbor);
      evolutionNeighbors.set(speciesId, neighbors);
    }
  }
  const evolutionPathsCache = new Map();
  const lineageCache = new Map();

  const cardNodes = new Map();
  const activeVariantIndex = new Map();
  const visibleSpecies = new Set();
  let state = loadState();
  let pendingRemovalKey = null;
  let activeDialogSpecies = null;
  let activeEvolutionSourceKey = "";
  let activeLineageSpeciesIds = null;
  let activeLineageRootId = 0;
  let activePokemonInfoKey = "";
  let activeResearchTool = "";
  let pokemonInfoShinyRevealed = false;
  let variantExitTimer;
  let toastTimer;
  let spriteModeTimer;
  let renderFrame;
  let lastCloudDescriptor = { status: "local" };

  function preferredLanguage() {
    return "fr";
  }

  function defaultState() {
    return {
      schemaVersion: 3,
      collection: {},
      huntRecords: {},
      preferences: {
        language: preferredLanguage(),
        animations: true,
        confirmRemove: false,
        spoilerGuard: false,
        cardSize: "normal",
        spriteMode: "2d"
      }
    };
  }

  function sanitizeCollection(collection) {
    const sanitized = {};
    if (!collection || typeof collection !== "object") return sanitized;
    for (const [key, rawQuantity] of Object.entries(collection)) {
      const canonicalKey = DATA.keyAliases?.[key] || key;
      if (!validKeys.has(canonicalKey)) continue;
      if (rawQuantity === EXCEPTION_VALUE) {
        if (!sanitized[canonicalKey]) sanitized[canonicalKey] = EXCEPTION_VALUE;
        continue;
      }
      const quantity = Math.min(MAX_QUANTITY, Math.max(0, Number.parseInt(rawQuantity, 10) || 0));
      if (quantity > 0) {
        const existing = sanitized[canonicalKey];
        sanitized[canonicalKey] = Math.max(Number(existing) || 0, quantity);
      }
    }
    return sanitized;
  }

  function normalizeState(raw) {
    const clean = defaultState();
    if (!raw || typeof raw !== "object") return clean;
    clean.collection = sanitizeCollection(raw.collection || raw.caught || raw);
    clean.huntRecords = sanitizeHuntRecords(raw.huntRecords);
    const language = raw.preferences?.language;
    clean.preferences.language = DATA.languages?.includes(language) ? language : clean.preferences.language;
    clean.preferences.animations = raw.preferences?.animations !== false;
    clean.preferences.confirmRemove = Boolean(raw.preferences?.confirmRemove);
    clean.preferences.spoilerGuard = Boolean(raw.preferences?.spoilerGuard);
    clean.preferences.cardSize = CARD_SIZE_LEVELS.some(level => level.id === raw.preferences?.cardSize)
      ? raw.preferences.cardSize
      : clean.preferences.cardSize;
    clean.preferences.spriteMode = raw.preferences?.spriteMode === "3d" ? "3d" : "2d";
    return clean;
  }

  function sanitizeHuntRecords(records) {
    const sanitized = {};
    if (!records || typeof records !== "object" || Array.isArray(records)) return sanitized;
    for (const [id, raw] of Object.entries(records)) {
      if (!raw || typeof raw !== "object") continue;
      const entryKey = DATA.keyAliases?.[raw.entryKey] || raw.entryKey;
      if (!validKeys.has(entryKey)) continue;
      const status = ["active", "caught", "discarded"].includes(raw.status) ? raw.status : "active";
      sanitized[id] = {
        id,
        entryKey,
        status,
        game: String(raw.game || "").slice(0, 60),
        method: HUNT_METHOD_KEYS.includes(raw.method) ? raw.method : "Other",
        attempts: Math.min(999999999, Math.max(0, Number.parseInt(raw.attempts, 10) || 0)),
        startedAt: validDateString(raw.startedAt),
        caughtAt: validDateString(raw.caughtAt),
        nickname: String(raw.nickname || "").slice(0, 40),
        notes: String(raw.notes || "").slice(0, 600),
        updatedAt: Number(raw.updatedAt) || Date.now()
      };
    }
    return sanitized;
  }

  function validDateString(value) {
    const normalized = String(value || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function loadState() {
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;
        const normalized = normalizeState(JSON.parse(stored));
        if (key !== STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      } catch {
        // Une sauvegarde corrompue ne doit jamais empêcher l’ouverture.
      }
    }
    return defaultState();
  }

  function saveState(notifyCloud = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast(t("localStorageError"));
    }
    if (notifyCloud) document.dispatchEvent(new CustomEvent("shinydex:local-change"));
  }

  function language() {
    return state.preferences.language || "fr";
  }

  function locale() {
    return I18N.locales[language()] || "fr-FR";
  }

  function t(key, values = {}) {
    const template = I18N.strings[language()]?.[key] ?? I18N.strings.fr[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  }

  function localizedName(entry) {
    return entry.names?.[language()] || entry.names?.fr || entry.name || entry.slug;
  }

  function localizedForm(entry) {
    return entry.formNames?.[language()] || entry.formNames?.fr || entry.label || "";
  }

  function localizedType(identifier) {
    return DATA.typeNames?.[identifier]?.[language()]
      || DATA.typeNames?.[identifier]?.fr
      || identifier;
  }

  function detailForEntry(entry) {
    if (!entry) return { pokemon: null, species: null, pokemonId: 0 };
    const pokemonId = Number(DETAILS.formPokemonIds?.[entry.formId]) || entry.speciesId;
    return {
      pokemonId,
      pokemon: DETAILS.pokemon?.[pokemonId] || DETAILS.pokemon?.[entry.speciesId] || null,
      species: DETAILS.species?.[entry.speciesId] || null
    };
  }

  function localizedDetailName(item) {
    return item?.names?.[language()] || item?.names?.fr || item?.names?.en || "";
  }

  function localizedTechnicalText(item, field = "shortEffects") {
    const source = item?.[field];
    const value = source?.[language()] || source?.fr || source?.en || "";
    return String(value).replaceAll("$effect_chance", String(item?.effectChance || "—"));
  }

  function localizedVersionName(versionId) {
    const version = DETAILS.versions?.[versionId];
    const name = localizedDetailName(version) || version?.identifier || `Version ${versionId}`;
    return [44, 45, 46].includes(Number(versionId)) ? `${name} (${t("japanEdition")})` : name;
  }

  function gameGeneration(game) {
    return Number(DETAILS.versions?.[game?.id]?.generation) || 0;
  }

  function gameAliases(gameId) {
    return GAME_VERSION_ALIASES[gameId] || [gameId];
  }

  function gameAvailabilityForEntry(entry) {
    const detail = detailForEntry(entry).pokemon;
    const present = new Set((detail?.gameVersionIds || []).map(Number));
    const encountered = new Set(Object.keys(detail?.encounters || {}).map(Number));
    return GAME_EDITION_DEFINITIONS.map(game => {
      const aliases = gameAliases(game.id);
      return {
        ...game,
        generation: gameGeneration(game),
        present: aliases.some(versionId => present.has(versionId)),
        direct: aliases.some(versionId => encountered.has(versionId))
      };
    }).filter(game => game.present || game.direct)
      .sort((left, right) => left.year - right.year || left.generation - right.generation || left.id - right.id);
  }

  function targetCanHatch(details) {
    const groups = details.species?.eggGroups || [];
    return Boolean(details.species?.baby) || groups.some(group => Number(group.id) !== 15);
  }

  function huntMethodsFor(entry, game, mode = "active") {
    const details = detailForEntry(entry);
    let methods = [...(game?.methods || [])];
    if (!targetCanHatch(details)) methods = methods.filter(method => !["Breeding", "Masuda"].includes(method));
    if (!game?.direct && game?.generation > 0 && game.generation <= 7 && game.id <= 30) {
      methods = methods.filter(method => !["Random", "Radar", "Horde", "Fishing", "Sos"].includes(method));
    }
    if (mode === "caught") methods.push("Distribution");
    return [...new Set(methods)].filter(method => HUNT_METHOD_KEYS.includes(method));
  }

  function defenseMultipliers(types) {
    return Object.fromEntries(DATA.types.map(attackingType => [
      attackingType,
      types.reduce((multiplier, defendingType) =>
        multiplier * (TYPE_EFFECTIVENESS[attackingType]?.[defendingType] ?? 1), 1)
    ]));
  }

  function todayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function newRecordId() {
    return globalThis.crypto?.randomUUID?.()
      || `hunt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function huntMethodLabel(method) {
    return t(`method${HUNT_METHOD_KEYS.includes(method) ? method : "Other"}`);
  }

  function spoilerHides(entry) {
    return Boolean(state.preferences.spoilerGuard && entry && !isShinyOwned(entry.key));
  }

  function currentCardSize() {
    return CARD_SIZE_LEVELS.find(level => level.id === state.preferences.cardSize)
      || CARD_SIZE_LEVELS[0];
  }

  function applyCardSize() {
    const level = currentCardSize();
    elements.pokemonGrid.dataset.cardSize = level.id;
    elements.cardSizeValue.textContent = `${level.percent} %`;
    const accessibleLabel = t("cardSizeButton", {
      size: t(level.labelKey),
      percent: level.percent
    });
    elements.cardSizeButton.setAttribute("aria-label", accessibleLabel);
    elements.cardSizeButton.setAttribute("title", accessibleLabel);
  }

  function cycleCardSize() {
    const currentIndex = CARD_SIZE_LEVELS.findIndex(level => level.id === currentCardSize().id);
    state.preferences.cardSize = CARD_SIZE_LEVELS[(currentIndex + 1) % CARD_SIZE_LEVELS.length].id;
    saveState();
    applyCardSize();
    render();
  }

  function spriteMode() {
    return state.preferences.spriteMode === "3d" ? "3d" : "2d";
  }

  function applySpriteMode() {
    const mode = spriteMode();
    document.documentElement.dataset.spriteMode = mode;
    elements.spriteModeButton.dataset.mode = mode;
    elements.spriteModeButton.setAttribute("aria-pressed", String(mode === "3d"));
    elements.spriteModeValue.textContent = mode === "3d" ? "3D HOME" : "2D PIXEL";
    const label = t("spriteModeButton", {
      mode: t(mode === "3d" ? "spriteMode3D" : "spriteMode2D")
    });
    elements.spriteModeButton.setAttribute("aria-label", label);
    elements.spriteModeButton.setAttribute("title", label);
  }

  function toggleSpriteMode() {
    const previous = spriteMode();
    const next = previous === "2d" ? "3d" : "2d";
    clearTimeout(spriteModeTimer);
    elements.spriteModeButton.classList.remove("is-switching");
    elements.spriteModeButton.dataset.direction = `${previous}-to-${next}`;
    if (state.preferences.animations) {
      void elements.spriteModeButton.offsetWidth;
      elements.spriteModeButton.classList.add("is-switching");
      spriteModeTimer = setTimeout(() => {
        elements.spriteModeButton.classList.remove("is-switching");
      }, 720);
    }
    state.preferences.spriteMode = next;
    saveState();
    applySpriteMode();
    render();
    renderEvolutionSuggestions();
    if (activeDialogSpecies && elements.variantDialog.hasAttribute("open")) {
      const group = groupsBySpecies.get(activeDialogSpecies);
      if (group) renderVariantDialog(group);
    }
    if (activeEvolutionSourceKey && elements.evolutionDialog.hasAttribute("open")) {
      const group = evolutionRecommendationGroups()
        .find(option => option.source.key === activeEvolutionSourceKey);
      if (group) renderEvolutionDialog(group);
    }
    renderHunts();
    if (activePokemonInfoKey && elements.pokemonInfoDialog.hasAttribute("open")) {
      renderPokemonInfo(entryByKey.get(activePokemonInfoKey), { revealShiny: pokemonInfoShinyRevealed });
    }
    if (activeResearchTool === "gallery" && elements.researchDialog.hasAttribute("open")) renderResearchTool("gallery");
    if (next === "3d") preloadShinySheets(true);
  }

  function normalizeAvailabilityName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

  function availabilityFor(entry) {
  if (!entry) return null;
  if (unavailableSpeciesIds.has(entry.speciesId)) {
    return { scope: "species", speciesId: entry.speciesId };
  }
  const formName = normalizeAvailabilityName(
    entry.formNames?.en || entry.formNames?.fr || entry.label || ""
  );
  return unavailableFormRules.find(rule =>
    Number(rule.speciesId) === entry.speciesId
    && (
      (rule.formIds || []).map(Number).includes(entry.formId)
      || (rule.names || []).some(name =>
        formName.includes(normalizeAvailabilityName(name))
      )
    )
  ) || null;
}

  function isLegallyObtainable(entry) {
  return availabilityFor(entry) === null;
}

  function localizedText(value) {
  if (value && typeof value === "object") {
    return value[language()] || value.en || value.fr || "";
  }
  return String(value || "");
}

  function distributionSourceUrls(item) {
  const canonical = item?.sourceUrls?.en || item?.sourceUrl || "";
  return {
    ...(DISTRIBUTION_SOURCE_LOCALES[canonical] || {}),
    ...(item?.sourceUrls || {}),
    ...(canonical ? { en: canonical } : {})
  };
}

  function genderText(entry) {
    const symbol = { male: "♂", female: "♀", genderless: "∅" }[entry.gender] || "";
    return `${symbol} ${t(entry.gender || "genderless")}`.trim();
  }

  function variantLabel(entry, { alwaysGender = false } = {}) {
    const form = localizedForm(entry);
    const showGender = alwaysGender || entry.genderAvailability === "mixed";
    const gender = showGender ? genderText(entry) : "";
    if (form && gender) return `${form} · ${gender}`;
    return form || gender;
  }

  function fullVariantName(entry) {
    const label = variantLabel(entry, { alwaysGender: true }) || t("defaultForm");
    return `${localizedName(entry)} — ${label}`;
  }

  function exceptionReasonText(entry) {
    const suffix = {
      mega: "Mega",
      gigamax: "Gigamax",
      fusion: "Fusion",
      item: "Item",
      temporary: "Temporary",
      battle: "Battle"
    }[entry.exceptionReason] || "Temporary";
    return t(`exceptionReason${suffix}`);
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase(locale())
      .replace(/[’']/g, "")
      .replace(/[^\p{Letter}\p{Number}♀♂]+/gu, " ")
      .trim();
  }

  function collectionValueFor(key) {
    const value = state.collection[key];
    if (value === EXCEPTION_VALUE) return EXCEPTION_VALUE;
    return Number(value) || 0;
  }

  function quantityFor(key) {
    const value = collectionValueFor(key);
    return value === EXCEPTION_VALUE ? 0 : value;
  }

  function isException(key) {
    return collectionValueFor(key) === EXCEPTION_VALUE;
  }

  function isOwned(key) {
    return collectionValueFor(key) === EXCEPTION_VALUE || quantityFor(key) > 0;
  }

  function isShinyOwned(key) {
    return quantityFor(key) > 0;
  }

  function displayedQuantity(key) {
    return isException(key) ? t("exception") : String(quantityFor(key) || 1);
  }

  function defaultOwnedValue(key) {
    return entryByKey.get(key)?.exceptional ? EXCEPTION_VALUE : 1;
  }

  function ownedInGroup(group) {
  return group.entries.reduce(
    (count, entry) => count + Number(isLegallyObtainable(entry) && isOwned(entry.key)),
    0
  );
}

  function formEntriesFor(group, entry) {
    const formKey = entry.formKey || String(entry.formId);
    return group.entries.filter(option =>
      (option.formKey || String(option.formId)) === formKey
    );
  }

  function isFormShinyComplete(group, entry) {
    if (entry.exceptional) return false;
    const required = formEntriesFor(group, entry).filter(option =>
      !option.exceptional && isLegallyObtainable(option)
    );
    return required.length > 0 && required.every(option => isShinyOwned(option.key));
  }

  function speciesAchievement(group) {
    const forms = group.forms
      .map(form => form.entries.filter(entry => !entry.exceptional && isLegallyObtainable(entry)))
      .filter(entries => entries.length > 0);
    if (!forms.length) return "";
    if (forms.every(entries => entries.every(entry => isShinyOwned(entry.key)))) return "gold";
    if (forms.every(entries => entries.some(entry => isShinyOwned(entry.key)))) return "silver";
    return "";
  }

  function renderCardQuantities(container, visual) {
    container.replaceChildren();
    const entries = visual.entries.filter(entry =>
      !entry.exceptional && isLegallyObtainable(entry) && isShinyOwned(entry.key)
    );
    container.hidden = entries.length === 0;
    if (!entries.length) return;
    const labels = [];
    for (const entry of entries) {
      const count = quantityFor(entry.key);
      const badge = document.createElement("span");
      const symbol = { male: "♂", female: "♀", genderless: "×" }[entry.gender] || "×";
      badge.textContent = entry.gender === "genderless" ? `×${count}` : `${symbol} ${count}`;
      badge.title = t("ownedCopies", { gender: genderText(entry), count: formatNumber(count) });
      labels.push(badge.title);
      container.append(badge);
    }
    container.setAttribute("aria-label", labels.join(" · "));
  }

  function applyCardAchievements(group, card, entry) {
    card.classList.toggle("is-form-complete", isFormShinyComplete(group, entry));
    const achievement = speciesAchievement(group);
    const trophy = card.querySelector(".pokemon-card__trophy");
    trophy.hidden = !achievement;
    trophy.classList.toggle("is-silver", achievement === "silver");
    trophy.classList.toggle("is-gold", achievement === "gold");
    trophy.setAttribute("aria-hidden", String(!achievement));
    if (achievement) {
      const label = t(achievement === "gold" ? "goldTrophy" : "silverTrophy");
      trophy.setAttribute("aria-label", label);
      trophy.setAttribute("title", label);
    } else {
      trophy.removeAttribute("aria-label");
      trophy.removeAttribute("title");
    }
  }
  function formatNumber(value) {
    return Number(value).toLocaleString(locale());
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function cancelVariantExitClose() {
    clearTimeout(variantExitTimer);
    variantExitTimer = null;
  }

  function scheduleVariantExitClose() {
    if (!ENABLE_VARIANT_EXIT_CLOSE) return;
    if (variantExitTimer) return;
    if (!elements.variantDialog?.hasAttribute("open")) return;
    variantExitTimer = setTimeout(() => {
      if (elements.variantDialog.hasAttribute("open")) closeDialog(elements.variantDialog);
    }, DIALOG_EXIT_DELAY);
  }

  function populateLanguageOptions() {
    elements.languageSelect.replaceChildren();
    for (const item of I18N.languages) {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = item.label;
      elements.languageSelect.append(option);
    }
    elements.languageSelect.value = language();
    const selected = I18N.languages.find(item => item.code === language()) || I18N.languages[0];
    if (elements.languageFlag && selected) {
      elements.languageFlag.src = selected.flagSrc;
      elements.languageFlag.alt = selected.label;
    }
  }

  function initializeFilters() {
    const previous = {
      generation: elements.generationFilter.value || "all",
      type: elements.typeFilter.value || "all",
      status: elements.statusFilter.value || "all",
      sort: elements.sortSelect.value || "number"
    };

    elements.generationFilter.replaceChildren(new Option(t("allGenerations"), "all"));
    for (const generation of DATA.generations) {
      const region = I18N.regions[language()]?.[generation - 1] || t("newRegion");
      elements.generationFilter.append(new Option(
        `${t("generation", { number: generation })} · ${region}`,
        String(generation)
      ));
    }

    elements.typeFilter.replaceChildren(new Option(t("allTypes"), "all"));
    for (const type of [...DATA.types].sort((a, b) =>
      localizedType(a).localeCompare(localizedType(b), locale())
    )) {
      elements.typeFilter.append(new Option(localizedType(type), type));
    }

    elements.statusFilter.replaceChildren(
      new Option(t("allStatuses"), "all"),
      new Option(t("ownedOnly"), "owned"),
      new Option(t("missingOnly"), "missing"),
      new Option(t("unobtainableOnly"), "unobtainable"),
      new Option(t("variantsOnly"), "variants")
    );
    elements.sortSelect.replaceChildren(
      new Option(t("sortNumber"), "number"),
      new Option(t("sortName"), "name"),
      new Option(t("sortOwned"), "owned"),
      new Option(t("sortMissing"), "missing")
    );

    elements.generationFilter.value = previous.generation;
    elements.typeFilter.value = previous.type;
    elements.statusFilter.value = previous.status;
    elements.sortSelect.value = previous.sort;
  }

  function applyStaticTranslations() {
    document.documentElement.lang = language();
    document.title = t("pageTitle");
    if (elements.metaDescription) elements.metaDescription.content = t("metaDescription");
    for (const node of document.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    }
    for (const node of document.querySelectorAll("[data-i18n-title]")) {
      node.setAttribute("title", t(node.dataset.i18nTitle));
    }
    for (const node of document.querySelectorAll("[data-i18n-aria]")) {
      node.setAttribute("aria-label", t(node.dataset.i18nAria));
    }
    elements.languageSelect.value = language();
    const revealing = elements.authPassword?.type === "text";
    if (elements.togglePasswordButton) {
      elements.togglePasswordButton.textContent = t(revealing ? "hide" : "show");
      elements.togglePasswordButton.setAttribute("aria-label", t(revealing ? "hide" : "show"));
    }
  }

  function spriteStyle(sprite, entry, shiny, explicitSize = 0, forcedMode = "") {
    const useHome = (forcedMode || spriteMode()) === "3d"
      && Number.isInteger(entry.homeSheet)
      && Number.isInteger(entry.homeSlot)
      && DATA.homeNormalSheets?.length
      && DATA.homeShinySheets?.length;
    const cellSize = useHome ? DATA.homeCellSize : DATA.cellSize;
    const atlasColumns = useHome ? DATA.homeAtlasColumns : DATA.atlasColumns;
    const atlasSize = useHome ? DATA.homeAtlasSize : DATA.atlasSize;
    const slot = useHome ? entry.homeSlot : entry.slot;
    const sheet = useHome ? entry.homeSheet : entry.sheet;
    const column = slot % atlasColumns;
    const row = Math.floor(slot / atlasColumns);
    const sheets = useHome
      ? (shiny ? DATA.homeShinySheets : DATA.homeNormalSheets)
      : (shiny ? DATA.shinySheets : DATA.normalSheets);
    const displaySize = explicitSize || (sprite.closest(".pokemon-card")
      ? currentCardSize().spriteSize
      : DATA.cellSize);
    const scale = displaySize / cellSize;
    sprite.style.backgroundImage = `url("${sheets[sheet]}")`;
    sprite.style.backgroundPosition = `${-column * cellSize * scale}px ${-row * cellSize * scale}px`;
    sprite.style.backgroundSize = `${atlasSize * scale}px ${atlasSize * scale}px`;
    sprite.style.imageRendering = useHome ? "auto" : "pixelated";
    sprite.dataset.spriteMode = useHome ? "3d" : "2d";
    sprite.setAttribute(
      "aria-label",
      `${localizedName(entry)}, ${variantLabel(entry, { alwaysGender: true }) || t("defaultForm")}${shiny ? " ✦" : ""}`
    );
  }

  function hasPlaceholderSprite(entry) {
    return spriteMode() === "3d"
      ? Boolean(entry.homeSpriteFallback)
      : Boolean(entry.spritePlaceholder);
  }

  function renderTypes(container, types) {
    container.replaceChildren();
    for (const type of types) {
      const pill = document.createElement("span");
      pill.className = "type-pill";
      pill.dataset.type = type;
      pill.textContent = localizedType(type);
      pill.style.setProperty("--type-color", TYPE_COLORS[type] || "#64748b");
      typeContainerTextColor(pill, type);
      container.append(pill);
    }
  }

  function typeContainerTextColor(pill, type) {
    const darkTextTypes = new Set(["normal", "electric", "grass", "ice", "ground", "flying", "bug", "rock", "steel", "fairy"]);
    pill.classList.toggle("type-pill--dark", darkTextTypes.has(type));
  }

  function currentVisual(group) {
    const index = (activeVariantIndex.get(group.speciesId) || 0) % group.visuals.length;
    return group.visuals[index];
  }

  function currentEntry(group) {
    return currentVisual(group).entry;
  }

  function ownedInVisual(visual) {
  return visual.entries.some(entry => isLegallyObtainable(entry) && isOwned(entry.key));
}
  function exceptionInVisual(visual) {
  return visual.entries.some(entry => isLegallyObtainable(entry) && isException(entry.key));
}
  function visualVariantLabel(visual) {
    const entry = visual.entry;
    const form = localizedForm(entry);
    const genders = new Set(visual.entries.map(option => option.gender));
    const gender = genders.has("male") && genders.has("female")
      ? `♂ ${t("male")} / ♀ ${t("female")}`
      : genderText(entry);
    if (form && gender) return `${form} · ${gender}`;
    return form || gender;
  }

  function groupHasGenderDifferences(group) {
    let hasMale = false;
    let hasFemale = false;
    let separatedVisual = false;
    for (const visual of group.visuals) {
      const genders = new Set(visual.entries.map(entry => entry.gender));
      hasMale ||= genders.has("male");
      hasFemale ||= genders.has("female");
      separatedVisual ||= genders.has("male") !== genders.has("female");
    }
    return hasMale && hasFemale && separatedVisual;
  }

  function updateCardView(group, card = cardNodes.get(group.speciesId)) {
  if (!card) return;
  const visual = currentVisual(group);
  const entry = visual.entry;
  const legalEntries = group.entries.filter(isLegallyObtainable);
  const ownedCount = ownedInGroup(group);
  const currentUnavailable = !visual.entries.some(isLegallyObtainable);
  const groupUnavailable = legalEntries.length === 0;
  const currentOwned = ownedInVisual(visual);
  const currentException = exceptionInVisual(visual);
  const complete = legalEntries.length > 0 && ownedCount === legalEntries.length;
  const multiple = group.entries.length > 1;
  const multipleVisuals = group.visuals.length > 1;
  const toggle = card.querySelector(".pokemon-card__toggle");
  const form = card.querySelector(".pokemon-card__form");
  const progress = card.querySelector(".pokemon-card__progress");
  const quantityInput = card.querySelector(".quantity__input");
  const unavailableBadge = card.querySelector(".unobtainable-badge");
  const placeholderBadge = card.querySelector(".sprite-placeholder-badge");
  const placeholderSprite = hasPlaceholderSprite(entry);

  card.dataset.key = entry.key;
  card.classList.toggle("has-variants", multiple);
  card.classList.toggle("has-visual-variants", multipleVisuals);
  card.classList.toggle("has-owned", ownedCount > 0);
  card.classList.toggle("is-complete", complete);
  card.classList.toggle("is-current-owned", currentOwned);
  card.classList.toggle("is-current-exception", currentException);
  card.classList.toggle("is-unobtainable", currentUnavailable);
  card.classList.toggle("is-fully-unobtainable", groupUnavailable);
  card.classList.toggle("has-exceptional-form", Boolean(entry.exceptional));
  card.classList.toggle("has-placeholder-sprite", placeholderSprite);
  applyCardAchievements(group, card, entry);
  card.title = currentUnavailable ? t("unobtainableDescription") : "";
  toggle.disabled = !multiple && currentUnavailable;
  toggle.setAttribute("aria-pressed", String(multiple ? complete : currentOwned));
  toggle.setAttribute(
    "aria-label",
    currentUnavailable && !multiple
      ? t("unobtainableDescription")
      : multiple
        ? `${localizedName(entry)} · ${t("openVariants")}`
        : t(currentOwned ? "removeOwned" : "markOwned", { name: fullVariantName(entry) })
  );

  card.querySelector(".pokemon-card__number").textContent = `#${String(entry.speciesId).padStart(4, "0")}`;
  const infoButton = card.querySelector(".pokemon-card__info");
  infoButton.setAttribute("aria-label", `${t("openPokedexInfo")} · ${fullVariantName(entry)}`);
  infoButton.setAttribute("title", t("technicalPokedex"));
  card.querySelector(".pokemon-card__name").textContent = localizedName(entry);
  const label = visualVariantLabel(visual);
  form.textContent = label;
  form.hidden = !label;
  progress.textContent = multiple
    ? t("variantProgress", { owned: ownedCount, count: legalEntries.length })
    : "";
  progress.hidden = currentUnavailable || !multiple;

  unavailableBadge.hidden = !currentUnavailable;
  unavailableBadge.querySelector(".unobtainable-badge__text").textContent = t("unobtainableBadge");
  unavailableBadge.setAttribute("title", t("unobtainableDescription"));

  const badge = card.querySelector(".variant-badge");
  const showBadge = multipleVisuals && group.speciesId !== SPINDA_ID;
  badge.hidden = !showBadge;
  badge.querySelector("strong").textContent = String(group.visuals.length);
  badge.setAttribute("title", t("variantBadge", { count: group.visuals.length }));
  badge.setAttribute("aria-label", `${localizedName(entry)} · ${t("variantBadge", { count: group.visuals.length })}`);

  placeholderBadge.hidden = !placeholderSprite;
  placeholderBadge.textContent = t("placeholderSprite");
  placeholderBadge.setAttribute("title", t("placeholderSpriteDescription"));

  quantityInput.value = currentUnavailable ? "—" : displayedQuantity(entry.key);
  quantityInput.classList.toggle("is-exception", !currentUnavailable && isException(entry.key));
  quantityInput.setAttribute("aria-label", currentUnavailable
    ? t("unobtainableDescription")
    : `${t("quantity")} · ${fullVariantName(entry)}`);
  card.querySelectorAll(".quantity button, .quantity input").forEach(control => {
    control.disabled = currentUnavailable;
  });
  spriteStyle(
    card.querySelector(".pokemon-sprite"),
    entry,
    currentOwned || card.classList.contains("is-shiny-preview")
  );
  card.querySelector(".pokemon-sprite").setAttribute(
    "aria-label",
    `${localizedName(entry)}, ${label || t("defaultForm")}${currentUnavailable ? ` · ${t("unobtainableShort")}` : currentOwned ? " ✦" : ""}`
  );
  renderTypes(card.querySelector(".pokemon-card__types"), entry.types);
  renderCardQuantities(card.querySelector(".pokemon-card__counts"), visual);
}
  function createCard(group) {
    const fragment = elements.pokemonCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".pokemon-card");
    card.dataset.speciesId = String(group.speciesId);
    updateCardView(group, card);

    card.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      const visual = currentVisual(group);
      if (spoilerHides(visual.entry)) return;
      card.classList.add("is-shiny-preview");
      spriteStyle(card.querySelector(".pokemon-sprite"), visual.entry, true);
    });
    card.addEventListener("pointerleave", () => {
      card.classList.remove("is-shiny-preview");
      updateCardView(group, card);
    });

    if (ENABLE_VARIANT_HOVER_OPEN && group.entries.length > 1) {
      let hoverTimer;
      card.addEventListener("pointerenter", event => {
        if (event.pointerType === "touch") return;
        card.dataset.hovering = "true";
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          if (card.isConnected && card.dataset.hovering === "true") {
            openVariantDialog(group.speciesId, currentEntry(group).key, { autoCloseOutside: true });
          }
        }, HOVER_DELAY);
      });
      card.addEventListener("pointerleave", () => {
        card.dataset.hovering = "";
        clearTimeout(hoverTimer);
      });
    }
    return card;
  }

  function currentFilters() {
    return {
      search: normalize(elements.searchInput.value),
      generation: elements.generationFilter.value,
      type: elements.typeFilter.value,
      status: elements.statusFilter.value,
      sort: elements.sortSelect.value
    };
  }

  function filteredGroups() {
  const filters = currentFilters();
  const numericSearch = filters.search.replace(/\D/g, "");
  const isNumberSearch = Boolean(filters.search) && /^#?\s*\d+$/.test(elements.searchInput.value.trim());
  const list = speciesGroups.filter(group => {
    if (activeLineageSpeciesIds && !activeLineageSpeciesIds.has(group.speciesId)) return false;
    if (filters.search) {
      const searchable = group.entries.flatMap(entry => [
        localizedName(entry),
        localizedForm(entry),
        entry.slug,
        genderText(entry)
      ]).join(" ");
      const matchesSearch = isNumberSearch
        ? String(group.speciesId) === String(Number(numericSearch))
        : normalize(searchable).includes(filters.search);
      if (!matchesSearch) return false;
    }
    if (filters.generation !== "all" && group.generation !== Number(filters.generation)) return false;
    if (filters.type !== "all" && !group.entries.some(entry => entry.types.includes(filters.type))) return false;
    const ownedCount = ownedInGroup(group);
    const legalCount = group.entries.filter(isLegallyObtainable).length;
    const hasUnavailable = group.entries.some(entry => !isLegallyObtainable(entry));
    if (filters.status === "owned" && ownedCount === 0) return false;
    if (filters.status === "missing" && (legalCount === 0 || ownedCount > 0)) return false;
    if (filters.status === "unobtainable" && !hasUnavailable) return false;
    if (filters.status === "variants" && (group.visuals.length < 2 || group.speciesId === SPINDA_ID)) return false;
    return true;
  });

  const byNumber = (a, b) => a.speciesId - b.speciesId;
  if (activeLineageSpeciesIds) {
    const lineageOrder = new Map(
      [...activeLineageSpeciesIds].map((speciesId, index) => [speciesId, index])
    );
    list.sort((a, b) =>
      (lineageOrder.get(a.speciesId) ?? Number.MAX_SAFE_INTEGER)
      - (lineageOrder.get(b.speciesId) ?? Number.MAX_SAFE_INTEGER)
      || byNumber(a, b)
    );
  } else if (filters.sort === "name") {
    list.sort((a, b) =>
      localizedName(a.entries[0]).localeCompare(localizedName(b.entries[0]), locale()) || byNumber(a, b)
    );
  } else if (filters.sort === "owned") {
    list.sort((a, b) => Number(ownedInGroup(b) > 0) - Number(ownedInGroup(a) > 0) || byNumber(a, b));
  } else if (filters.sort === "missing") {
    list.sort((a, b) => Number(ownedInGroup(a) > 0) - Number(ownedInGroup(b) > 0) || byNumber(a, b));
  } else {
    list.sort(byNumber);
  }
  return list;
}

  function evolutionFormName(entry) {
    return normalizeAvailabilityName(entry.formNames?.en || entry.formNames?.fr || entry.label || "");
  }

  function evolutionRegion(entry) {
    const form = evolutionFormName(entry);
    return ["alola", "galar", "hisui", "paldea"].find(region => form.includes(region)) || "";
  }

  function evolutionFormTrait(entry) {
    const form = evolutionFormName(entry);
    for (const [groupIndex, group] of EVOLUTION_FORM_TRAIT_GROUPS.entries()) {
      if (!group.species.has(entry.speciesId)) continue;
      const value = group.values.find(candidate => form.includes(candidate));
      return value ? `${groupIndex}:${value}` : "";
    }
    return "";
  }

  function formsCanShareEvolution(source, target) {
    const sourceGroupIndex = EVOLUTION_FORM_TRAIT_GROUPS.findIndex(group =>
      group.species.has(source.speciesId)
    );
    if (sourceGroupIndex < 0) return true;
    const traitGroup = EVOLUTION_FORM_TRAIT_GROUPS[sourceGroupIndex];
    if (!traitGroup.species.has(target.speciesId)) return true;
    const sourceTrait = evolutionFormTrait(source);
    const targetTrait = evolutionFormTrait(target);
    return Boolean(sourceTrait && targetTrait && sourceTrait === targetTrait);
  }

  function sourceFormCanEvolve(source) {
    const form = evolutionFormName(source);
    if (source.speciesId === 172 && source.formId !== 172) return false;
    if (source.speciesId === 25 && source.formId !== 25) return false;
    if (source.speciesId === 670 && form.includes("eternal")) return false;
    return true;
  }

  function targetFormCanResultFromEvolution(source, target, path) {
    if (!formsCanShareEvolution(source, target)) return false;
    if (source.speciesId === 172 && target.speciesId === 25 && target.formId !== 25) return false;
    if (target.speciesId === 666 && target.formId === 10162) return false;

    const sourceForm = evolutionFormName(source);
    const targetForm = evolutionFormName(target);
    if (source.speciesId === 744 && target.speciesId === 745) {
      const ownsTempo = sourceForm.includes("own tempo");
      return ownsTempo ? targetForm.includes("dusk") : !targetForm.includes("dusk");
    }
    return path.length > 1;
  }

  function genderCanEvolveTo(source, target) {
    if (target.gender === "genderless") return true;
    if (source.gender === "genderless") return target.gender === "genderless";
    return source.gender === target.gender;
  }

  function sourceCanFollowPath(source, path) {
    if (path.length < 2) return false;
    const firstEdge = `${path[0]}:${path[1]}`;
    const finalEdge = `${path[0]}:${path[path.length - 1]}`;
    const form = evolutionFormName(source);
    const requirement = EVOLUTION_SOURCE_FORM_REQUIREMENTS.get(finalEdge)
      || EVOLUTION_SOURCE_FORM_REQUIREMENTS.get(firstEdge);
    const exclusion = EVOLUTION_SOURCE_FORM_EXCLUSIONS.get(finalEdge)
      || EVOLUTION_SOURCE_FORM_EXCLUSIONS.get(firstEdge);
    return (!requirement || form.includes(requirement))
      && (!exclusion || !form.includes(exclusion));
  }

  function targetEntriesForEvolution(source, targetGroup, path) {
    let candidates = targetGroup.entries.filter(entry =>
      !entry.exceptional
      && isLegallyObtainable(entry)
      && genderCanEvolveTo(source, entry)
      && targetFormCanResultFromEvolution(source, entry, path)
    );
    if (!candidates.length || !sourceCanFollowPath(source, path)) return [];

    const directEdge = `${path[0]}:${path[1]}`;
    const sourceForm = evolutionFormName(source);

    if (directEdge === "1012:1013") {
      const expected = sourceForm.includes("artisan") || sourceForm.includes("onereuse")
        ? ["masterpiece", "exceptionnelle"]
        : ["unremarkable", "mediocre"];
      candidates = candidates.filter(entry =>
        expected.some(token => evolutionFormName(entry).includes(token))
      );
    }

    const region = evolutionRegion(source);
    const sourceGroup = groupsBySpecies.get(source.speciesId);
    const sourceHasRegionalForms = sourceGroup?.entries.some(entry => evolutionRegion(entry));
    const targetHasRegionalForms = candidates.some(entry => evolutionRegion(entry));
    if (sourceHasRegionalForms && targetHasRegionalForms) {
      candidates = candidates.filter(entry => evolutionRegion(entry) === region);
    }
    return candidates;
  }

  function evolutionPathsFrom(speciesId) {
    if (evolutionPathsCache.has(speciesId)) return evolutionPathsCache.get(speciesId);
    const paths = [];
    const queue = [[speciesId]];
    while (queue.length) {
      const path = queue.shift();
      const current = path[path.length - 1];
      for (const target of evolutionAdjacency.get(current) || []) {
        if (path.includes(target) || path.length > 6) continue;
        const nextPath = [...path, target];
        paths.push(nextPath);
        queue.push(nextPath);
      }
    }
    evolutionPathsCache.set(speciesId, paths);
    return paths;
  }

  function lineageSpeciesIdsFor(speciesId) {
    if (lineageCache.has(speciesId)) return lineageCache.get(speciesId);
    const lineage = new Set([speciesId]);
    const queue = [speciesId];
    while (queue.length) {
      const current = queue.shift();
      for (const neighbor of evolutionNeighbors.get(current) || []) {
        if (lineage.has(neighbor)) continue;
        lineage.add(neighbor);
        queue.push(neighbor);
      }
    }

    const roots = [...lineage]
      .filter(candidate => !(evolutionPredecessors.get(candidate) || [])
        .some(predecessor => lineage.has(predecessor)))
      .sort((a, b) => a - b);
    if (!roots.length) roots.push(speciesId);

    const depthBySpecies = new Map(roots.map(root => [root, 0]));
    const depthQueue = [...roots];
    while (depthQueue.length) {
      const current = depthQueue.shift();
      const nextDepth = (depthBySpecies.get(current) || 0) + 1;
      for (const target of evolutionAdjacency.get(current) || []) {
        if (!lineage.has(target) || depthBySpecies.has(target)) continue;
        depthBySpecies.set(target, nextDepth);
        depthQueue.push(target);
      }
    }

    const orderedLineage = [...lineage].sort((a, b) =>
      (depthBySpecies.get(a) ?? Number.MAX_SAFE_INTEGER)
      - (depthBySpecies.get(b) ?? Number.MAX_SAFE_INTEGER)
      || a - b
    );
    lineageCache.set(speciesId, orderedLineage);
    return orderedLineage;
  }

  function applyLineageFilter(speciesId) {
    const group = groupsBySpecies.get(speciesId);
    if (!group) return;
    activeLineageRootId = speciesId;
    activeLineageSpeciesIds = new Set(lineageSpeciesIdsFor(speciesId));
    elements.searchInput.value = "";
    elements.generationFilter.value = "all";
    elements.typeFilter.value = "all";
    elements.statusFilter.value = "all";
    elements.sortSelect.value = "number";
    closeDialog(elements.variantDialog);
    render();
    document.querySelector(".collection-panel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    showToast(t("lineageApplied", {
      name: localizedName(group.entries[0]),
      count: formatNumber(activeLineageSpeciesIds.size)
    }));
  }

  function evolutionRecommendations() {
    const bestBySourceAndTarget = new Map();
    const sources = DATA.entries.filter(entry =>
      !entry.exceptional
      && isLegallyObtainable(entry)
      && sourceFormCanEvolve(entry)
      && quantityFor(entry.key) > 1
    );

    for (const source of sources) {
      const sourceQuantity = quantityFor(source.key);
      for (const path of evolutionPathsFrom(source.speciesId)) {
        const targetGroup = groupsBySpecies.get(path[path.length - 1]);
        if (!targetGroup) continue;
        for (const target of targetEntriesForEvolution(source, targetGroup, path)) {
          if (isShinyOwned(target.key)) continue;
          const recommendation = {
            source,
            sourceQuantity,
            target,
            path,
            steps: path.length - 1
          };
          const recommendationKey = `${source.key}|${target.key}`;
          const existing = bestBySourceAndTarget.get(recommendationKey);
          if (
            !existing
            || recommendation.steps < existing.steps
            || (
              recommendation.steps === existing.steps
              && recommendation.sourceQuantity > existing.sourceQuantity
            )
          ) {
            bestBySourceAndTarget.set(recommendationKey, recommendation);
          }
        }
      }
    }

    return [...bestBySourceAndTarget.values()].sort((a, b) =>
      a.source.speciesId - b.source.speciesId
      || a.target.speciesId - b.target.speciesId
      || (a.target.formOrder ?? 0) - (b.target.formOrder ?? 0)
      || (GENDER_ORDER[a.target.gender] ?? 9) - (GENDER_ORDER[b.target.gender] ?? 9)
    );
  }

  function evolutionRecommendationGroups() {
    const groups = new Map();
    for (const recommendation of evolutionRecommendations()) {
      const group = groups.get(recommendation.source.key) || {
        source: recommendation.source,
        sourceQuantity: recommendation.sourceQuantity,
        recommendations: []
      };
      group.recommendations.push(recommendation);
      groups.set(recommendation.source.key, group);
    }
    return [...groups.values()].sort((a, b) =>
      a.source.speciesId - b.source.speciesId
      || (a.source.formOrder ?? 0) - (b.source.formOrder ?? 0)
      || (GENDER_ORDER[a.source.gender] ?? 9) - (GENDER_ORDER[b.source.gender] ?? 9)
    );
  }

  function evolutionPathText(recommendation) {
    return t("evolutionPath", {
      path: recommendation.path.map(speciesId => {
        const group = groupsBySpecies.get(speciesId);
        return group ? localizedName(group.entries[0]) : `#${speciesId}`;
      }).join(" → ")
    });
  }

  function renderEvolutionDialog(group) {
    if (!group) return;
    elements.evolutionDialogTitle.textContent = t("evolutionDialogTitle", {
      name: localizedName(group.source)
    });
    elements.evolutionDialogIntro.textContent = t(
      group.recommendations.length === 1 ? "evolutionDialogIntroOne" : "evolutionDialogIntro",
      { count: formatNumber(group.recommendations.length) }
    );

    const sourceSprite = document.createElement("span");
    sourceSprite.className = "evolution-dialog__source-sprite";
    spriteStyle(sourceSprite, group.source, true, 72);
    const sourceText = document.createElement("span");
    const sourceName = document.createElement("strong");
    sourceName.textContent = localizedName(group.source);
    const sourceVariant = document.createElement("small");
    sourceVariant.textContent = variantLabel(group.source, { alwaysGender: true }) || t("defaultForm");
    const sourceCount = document.createElement("em");
    sourceCount.textContent = t("evolutionCopies", {
      count: formatNumber(group.sourceQuantity),
      remaining: formatNumber(group.sourceQuantity - 1)
    });
    sourceText.append(sourceName, sourceVariant, sourceCount);
    elements.evolutionDialogSource.replaceChildren(sourceSprite, sourceText);

    const fragment = document.createDocumentFragment();
    for (const recommendation of group.recommendations) {
      const card = document.createElement("article");
      card.className = "evolution-choice";
      const sprite = document.createElement("span");
      sprite.className = "evolution-choice__sprite";
      spriteStyle(sprite, recommendation.target, true);
      const name = document.createElement("strong");
      name.textContent = localizedName(recommendation.target);
      const variant = document.createElement("small");
      variant.textContent = variantLabel(recommendation.target, { alwaysGender: true }) || t("defaultForm");
      const status = document.createElement("span");
      status.className = "evolution-card__target-status";
      status.textContent = t("evolutionMissingTarget");
      const path = document.createElement("p");
      path.textContent = evolutionPathText(recommendation);
      card.append(sprite, name, variant, status, path);
      fragment.append(card);
    }
    elements.evolutionDialogGrid.replaceChildren(fragment);
  }

  function openEvolutionDialog(sourceKey) {
    const group = evolutionRecommendationGroups().find(option => option.source.key === sourceKey);
    if (!group) return;
    activeEvolutionSourceKey = sourceKey;
    renderEvolutionDialog(group);
    showDialog(elements.evolutionDialog);
  }

  function renderEvolutionSuggestions() {
    if (!elements.evolutionSuggestions) return;
    const groups = evolutionRecommendationGroups();
    elements.evolutionCount.textContent = t(
      groups.length === 1 ? "evolutionCountOne" : "evolutionCount",
      { count: formatNumber(groups.length) }
    );
    elements.evolutionEmpty.hidden = groups.length > 0;
    const fragment = document.createDocumentFragment();

    for (const group of groups) {
      const card = document.createElement("button");
      card.className = "evolution-card";
      card.type = "button";
      card.dataset.sourceKey = group.source.key;
      card.setAttribute("aria-label", t("evolutionOpen", {
        name: localizedName(group.source),
        count: formatNumber(group.recommendations.length)
      }));

      const source = document.createElement("div");
      source.className = "evolution-card__pokemon";
      const sourceSprite = document.createElement("span");
      sourceSprite.className = "evolution-card__sprite";
      spriteStyle(sourceSprite, group.source, true);
      const sourceName = document.createElement("strong");
      sourceName.textContent = localizedName(group.source);
      const sourceVariant = document.createElement("small");
      sourceVariant.textContent = variantLabel(group.source, { alwaysGender: true }) || t("defaultForm");
      const sourceCount = document.createElement("span");
      sourceCount.className = "evolution-card__count";
      sourceCount.textContent = t("evolutionCopies", {
        count: formatNumber(group.sourceQuantity),
        remaining: formatNumber(group.sourceQuantity - 1)
      });
      source.append(sourceSprite, sourceName, sourceVariant, sourceCount);

      const arrow = document.createElement("span");
      arrow.className = "evolution-card__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";

      const target = document.createElement("div");
      target.className = "evolution-card__summary";
      const previews = document.createElement("span");
      previews.className = "evolution-card__previews";
      for (const recommendation of group.recommendations.slice(0, 3)) {
        const preview = document.createElement("span");
        spriteStyle(preview, recommendation.target, true, 52);
        previews.append(preview);
      }
      const targetCount = document.createElement("strong");
      targetCount.textContent = t(
        group.recommendations.length === 1 ? "evolutionOptionsOne" : "evolutionOptions",
        { count: formatNumber(group.recommendations.length) }
      );
      const openText = document.createElement("small");
      openText.textContent = t("evolutionOpenDetails");
      target.append(previews, targetCount, openText);

      const path = document.createElement("p");
      path.className = "evolution-card__path";
      path.textContent = [...new Set(group.recommendations.map(recommendation =>
        localizedName(recommendation.target)
      ))].join(" · ");

      const body = document.createElement("div");
      body.className = "evolution-card__body";
      body.append(source, arrow, target);
      card.append(body, path);
      fragment.append(card);
    }

    elements.evolutionSuggestions.replaceChildren(fragment);
    if (activeEvolutionSourceKey && elements.evolutionDialog.hasAttribute("open")) {
      const activeGroup = groups.find(group => group.source.key === activeEvolutionSourceKey);
      if (activeGroup) renderEvolutionDialog(activeGroup);
      else closeDialog(elements.evolutionDialog);
    }
  }
  function observeCard(card, speciesId) {
    if (!cardObserver) {
      visibleSpecies.add(speciesId);
      return;
    }
    cardObserver.observe(card);
  }

  const cardObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        for (const observed of entries) {
          const speciesId = Number(observed.target.dataset.speciesId);
          if (observed.isIntersecting) visibleSpecies.add(speciesId);
          else visibleSpecies.delete(speciesId);
        }
      }, { rootMargin: "180px" })
    : null;

  function render() {
    const groups = filteredGroups();
    const fragment = document.createDocumentFragment();
    cardObserver?.disconnect();
    cardNodes.clear();
    visibleSpecies.clear();
    for (const group of groups) {
      const card = createCard(group);
      cardNodes.set(group.speciesId, card);
      fragment.append(card);
    }
    elements.pokemonGrid.replaceChildren(fragment);
    for (const [speciesId, card] of cardNodes) observeCard(card, speciesId);
    elements.emptyState.hidden = groups.length > 0;
    elements.pokemonGrid.hidden = groups.length === 0;
    elements.resultCount.textContent = t(groups.length === 1 ? "resultOne" : "results", {
      count: formatNumber(groups.length)
    });
    updateActiveFilter();
  }

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  }

  function updateActiveFilter() {
    const filters = currentFilters();
    const labels = [];
    if (filters.search) labels.push(t("filterSearch", { value: elements.searchInput.value.trim() }));
    if (filters.generation !== "all") labels.push(t("filterGeneration", { value: filters.generation }));
    if (filters.type !== "all") labels.push(t("filterType", { value: localizedType(filters.type) }));
    if (filters.status !== "all") {
      labels.push(t({
        owned: "filterOwned",
        missing: "filterMissing",
        unobtainable: "filterUnobtainable",
        variants: "filterVariants"
      }[filters.status]));
    }
    if (activeLineageSpeciesIds) {
      const root = groupsBySpecies.get(activeLineageRootId);
      labels.push(t("filterLineage", {
        name: root ? localizedName(root.entries[0]) : `#${activeLineageRootId}`
      }));
    }
    elements.activeFilter.hidden = labels.length === 0;
    elements.activeFilterText.textContent = labels.length
      ? t("activeFilters", { filters: labels.join(" · ") })
      : "";
  }

  function updateStats() {
  const ownedEntries = eligibleEntries.filter(entry => isOwned(entry.key));
  const ownedSpecies = new Set(ownedEntries.map(entry => entry.speciesId)).size;
  const totalCopies = eligibleEntries.reduce((sum, entry) => {
    const value = state.collection[entry.key];
    return sum + (value === EXCEPTION_VALUE ? 0 : (Number(value) || 0));
  }, 0);
  const percentage = eligibleSpeciesIds.size ? (ownedSpecies / eligibleSpeciesIds.size) * 100 : 0;
  const rounded = percentage === 0
    ? "0"
    : percentage < 0.1
      ? percentage.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : percentage < 100
        ? percentage.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : "100";

  elements.ownedCount.textContent = formatNumber(ownedEntries.length);
  elements.appearanceTotal.textContent = formatNumber(eligibleEntries.length);
  elements.speciesCount.textContent = formatNumber(ownedSpecies);
  elements.speciesTotal.textContent = formatNumber(eligibleSpeciesIds.size);
  elements.copyCount.textContent = formatNumber(totalCopies);
  elements.progressPercent.textContent = `${rounded} %`;
  const visiblePercentage = percentage > 0 ? Math.max(0.35, percentage) : 0;
  elements.progressBar.style.width = `${Math.min(100, visiblePercentage)}%`;
  elements.progressBar.parentElement.setAttribute("aria-valuenow", percentage.toFixed(2));
  elements.progressBar.parentElement.setAttribute("aria-valuetext", `${rounded} %`);

  const messageKey = percentage === 0
    ? "progressStart"
    : percentage < 25
      ? "progressLow"
      : percentage < 50
        ? "progressQuarter"
        : percentage < 75
          ? "progressHalf"
          : percentage < 100
            ? "progressNear"
            : "progressDone";
  elements.progressMessage.textContent = t(messageKey);
}
  function updateSpeciesCard(speciesId) {
    const group = groupsBySpecies.get(speciesId);
    if (group) updateCardView(group);
  }

  function setQuantity(key, rawQuantity, { sparkle = false } = {}) {
  const entry = entryByKey.get(key);
  if (entry && !isLegallyObtainable(entry)) {
    showToast(t("unobtainableToast"));
    return;
  }
  const previousOwned = isOwned(key);
  const quantity = rawQuantity === EXCEPTION_VALUE
    ? EXCEPTION_VALUE
    : Math.min(MAX_QUANTITY, Math.max(0, Number.parseInt(rawQuantity, 10) || 0));
  if (quantity === EXCEPTION_VALUE || quantity > 0) state.collection[key] = quantity;
  else delete state.collection[key];
  saveState();
  updateStats();
  renderEvolutionSuggestions();

  const group = groupByEntryKey.get(key);
  const filters = currentFilters();
  if (
    filters.status === "owned"
    || filters.status === "missing"
    || filters.status === "unobtainable"
    || filters.sort === "owned"
    || filters.sort === "missing"
  ) {
    render();
  } else if (group) {
    updateSpeciesCard(group.speciesId);
  }
  if (activeDialogSpecies === group?.speciesId && elements.variantDialog.hasAttribute("open")) {
    renderVariantDialog(group, key);
  }

  if (sparkle && !previousOwned && isOwned(key) && state.preferences.animations) {
    const card = group ? cardNodes.get(group.speciesId) : null;
    if (card) createSparkles(card);
  }
}
  function incrementEntry(key) {
    if (isException(key)) {
      setQuantity(key, 1);
      return;
    }
    const quantity = quantityFor(key);
    setQuantity(key, quantity > 0 ? quantity + 1 : defaultOwnedValue(key), {
      sparkle: quantity === 0
    });
  }

  function decrementEntry(key) {
    if (isException(key)) {
      requestRemoval(key, { forceConfirm: true });
      return;
    }
    const quantity = quantityFor(key);
    if (quantity <= 0) {
      requestRemoval(key);
    } else if (quantity === 1) {
      setQuantity(key, EXCEPTION_VALUE);
    } else {
      setQuantity(key, quantity - 1);
    }
  }

  function applyQuantityInput(key, rawValue) {
    const value = String(rawValue || "").trim();
    if (normalize(value) === normalize(t("exception")) || value.toLowerCase() === EXCEPTION_VALUE) {
      setQuantity(key, EXCEPTION_VALUE);
      return;
    }
    const quantity = Number.parseInt(value, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      requestRemoval(key, { forceConfirm: true });
      return;
    }
    setQuantity(key, quantity);
  }

  function requestRemoval(key, { forceConfirm = false } = {}) {
    const entry = entryByKey.get(key);
    if (!entry) return;
    if (!forceConfirm && !state.preferences.confirmRemove) {
      setQuantity(key, 0);
      return;
    }
    pendingRemovalKey = key;
    elements.removeDialogText.textContent = t("removeDialogText", { name: fullVariantName(entry) });
    showDialog(elements.removeDialog);
  }

  function toggleEntry(key) {
    if (isOwned(key)) requestRemoval(key);
    else setQuantity(key, defaultOwnedValue(key), { sparkle: true });
  }

  function createSparkles(card) {
    const rectangle = card.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    const centerY = rectangle.top + rectangle.height * 0.42;
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + Math.random() * 0.25;
      const distance = 34 + Math.random() * 38;
      const sparkle = document.createElement("span");
      sparkle.className = "sparkle";
      sparkle.style.left = `${centerX}px`;
      sparkle.style.top = `${centerY}px`;
      sparkle.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
      sparkle.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
      sparkle.style.animationDelay = `${Math.random() * 80}ms`;
      document.body.append(sparkle);
      sparkle.addEventListener("animationend", () => sparkle.remove(), { once: true });
    }
  }

  function resetFilters() {
    elements.searchInput.value = "";
    elements.generationFilter.value = "all";
    elements.typeFilter.value = "all";
    elements.statusFilter.value = "all";
    elements.sortSelect.value = "number";
    activeLineageSpeciesIds = null;
    activeLineageRootId = 0;
    render();
  }

  function syncPreferences() {
    elements.animationSetting.checked = state.preferences.animations;
    elements.confirmSetting.checked = state.preferences.confirmRemove;
    elements.spoilerSetting.checked = state.preferences.spoilerGuard;
    elements.languageSelect.value = language();
    applyCardSize();
    applySpriteMode();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
  }

  function publicState() {
    return {
      schemaVersion: 3,
      collection: { ...state.collection },
      huntRecords: Object.fromEntries(Object.entries(state.huntRecords).map(([id, record]) => [id, { ...record }])),
      preferences: { ...state.preferences }
    };
  }

  function applySyncedState(nextState, notification = "") {
    const previousLanguage = language();
    state = normalizeState(nextState);
    saveState(false);
    syncPreferences();
    if (language() !== previousLanguage) applyLanguage();
    else {
      updateStats();
      render();
      renderEvolutionSuggestions();
      renderHunts();
      if (activeDialogSpecies) {
        const group = groupsBySpecies.get(activeDialogSpecies);
        if (group) renderVariantDialog(group);
      }
    }
    if (notification) showToast(notification);
  }

  function renderCloudStatus() {
    const {
      user = null,
      status = "local",
      label = "",
      labelKey = "",
      detail = "",
      detailKey = ""
    } = lastCloudDescriptor;
    const connected = Boolean(user);
    const stateClass = {
      syncing: "is-syncing",
      synced: "is-synced",
      error: "is-error",
      offline: "is-error"
    }[status] || "";
    const shortLabel = t({
      local: "statusLocalShort",
      syncing: "statusSyncingShort",
      synced: "statusSyncedShort",
      error: "statusErrorShort",
      offline: "statusOfflineShort"
    }[status] || "statusLocalShort");
    const longLabel = labelKey
      ? t(labelKey)
      : label || t({
          local: "statusLocalLong",
          syncing: "statusSyncingLong",
          synced: "statusSyncedLong",
          error: "statusErrorLong",
          offline: "statusOfflineLong"
        }[status] || "statusLocalLong");

    for (const dot of [elements.cloudDot, elements.dialogCloudDot]) {
      dot?.classList.remove("is-syncing", "is-synced", "is-error");
      if (stateClass) dot?.classList.add(stateClass);
    }
    elements.cloudStatusLabel.textContent = shortLabel;
    elements.accountLabel.textContent = connected ? user.email : t("login");
    elements.signedOutPanel.hidden = connected;
    elements.signedInPanel.hidden = !connected;
    elements.accountEmail.textContent = user?.email || "";
    elements.cloudStatusText.textContent = longLabel;
    elements.cloudStatusDetail.textContent = detailKey
      ? t(detailKey)
      : detail || t(connected ? "statusConnectedDetail" : "statusLocalDetail");
  }

  function setCloudStatus(descriptor = {}) {
    lastCloudDescriptor = { ...descriptor };
    renderCloudStatus();
  }

  function exportCollection() {
    const payload = {
      format: "pokemon-shinydex",
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      dataGeneratedAt: DATA.generatedAt,
      collection: state.collection,
      huntRecords: state.huntRecords,
      preferences: state.preferences
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pokemon-shinydex-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(t("exportDone"));
  }

  async function importCollection(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format && payload.format !== "pokemon-shinydex") {
        throw new Error(t("invalidOrigin"));
      }
      const imported = normalizeState(payload);
      if (Object.keys(imported.collection).length === 0 && Object.keys(payload.collection || {}).length > 0) {
        throw new Error(t("noCompatibleCard"));
      }
      state = imported;
      saveState();
      syncPreferences();
      applyLanguage();
      showToast(t("importDone"));
    } catch (error) {
      showToast(error.message || t("invalidFile"));
    } finally {
      elements.importInput.value = "";
    }
  }

  function renderVariantDialog(group, preferredKey = "") {
  activeDialogSpecies = group.speciesId;
  const previousScroll = elements.variantGrid.scrollTop;
  elements.variantDialogTitle.textContent = t("variantsTitle", {
    name: localizedName(group.entries[0])
  });
  elements.lineageButton.dataset.speciesId = String(group.speciesId);
  elements.lineageButton.querySelector("span").textContent = t("showLineage");
  elements.lineageButton.setAttribute("aria-label", t("showLineageFor", {
    name: localizedName(group.entries[0])
  }));
  const fragment = document.createDocumentFragment();
  for (const entry of group.entries) {
    const item = elements.variantCardTemplate.content.cloneNode(true);
    const card = item.querySelector(".variant-option");
    const toggle = item.querySelector(".variant-option__toggle");
    const unavailable = !isLegallyObtainable(entry);
    const owned = !unavailable && isOwned(entry.key);
    const exception = !unavailable && isException(entry.key);
    card.dataset.key = entry.key;
    const infoButton = item.querySelector(".variant-option__info");
    infoButton.setAttribute("aria-label", `${t("openPokedexInfo")} · ${fullVariantName(entry)}`);
    infoButton.setAttribute("title", t("technicalPokedex"));
    card.classList.toggle("is-owned", owned);
    card.classList.toggle("is-exception", exception);
    card.classList.toggle("is-unobtainable", unavailable);
    card.classList.toggle("is-exceptional-form", Boolean(entry.exceptional));
    card.classList.toggle("is-form-complete", isFormShinyComplete(group, entry));
    const placeholderSprite = hasPlaceholderSprite(entry);
    card.classList.toggle("has-placeholder-sprite", placeholderSprite);
    card.title = unavailable
      ? t("unobtainableDescription")
      : entry.exceptional
        ? exceptionReasonText(entry)
        : "";
    if (entry.key === preferredKey) card.classList.add("is-current");
    toggle.disabled = unavailable;
    toggle.setAttribute("aria-pressed", String(owned));
    toggle.setAttribute(
      "aria-label",
      unavailable
        ? t("unobtainableDescription")
        : t(owned ? "removeOwned" : "markOwned", { name: fullVariantName(entry) })
    );
    const sprite = item.querySelector(".variant-option__sprite");
    const placeholderBadge = item.querySelector(".sprite-placeholder-badge");
    spriteStyle(sprite, entry, owned);
    placeholderBadge.hidden = !placeholderSprite;
    placeholderBadge.textContent = t("placeholderSprite");
    placeholderBadge.setAttribute("title", t("placeholderSpriteDescription"));
    card.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      if (spoilerHides(entry)) return;
      spriteStyle(sprite, entry, true);
      card.classList.toggle("is-shiny-preview", !owned);
    });
    card.addEventListener("pointerleave", () => {
      spriteStyle(sprite, entry, owned);
      card.classList.remove("is-shiny-preview");
    });
    item.querySelector(".variant-option__form").textContent =
      localizedForm(entry) || t("defaultForm");
    item.querySelector(".variant-option__gender").textContent = genderText(entry);
    const variantStatus = unavailable
      ? t("unobtainableDescription")
      : exception
        ? t("exception")
        : owned
          ? t("owned")
          : entry.exceptional
            ? t("exceptionSuggested", { reason: exceptionReasonText(entry) })
            : t("missing");
    item.querySelector(".variant-option__status").textContent = variantStatus;
    renderTypes(item.querySelector(".variant-option__types"), entry.types);
    const input = item.querySelector(".quantity__input");
    input.value = unavailable ? "—" : displayedQuantity(entry.key);
    input.classList.toggle("is-exception", exception);
    input.setAttribute("aria-label", unavailable
      ? t("unobtainableDescription")
      : `${t("quantity")} · ${fullVariantName(entry)}`);
    item.querySelectorAll(".quantity button, .quantity input").forEach(control => {
      control.disabled = unavailable;
    });
    fragment.append(item);
  }
  elements.variantGrid.replaceChildren(fragment);
  elements.variantGrid.scrollTop = previousScroll;

  const hasGenderDifferences = groupHasGenderDifferences(group);
  elements.genderDifferenceNote.hidden = !hasGenderDifferences;
  if (hasGenderDifferences) {
    elements.genderDifferenceTitle.textContent = t("genderDifferenceTitle");
    elements.genderDifferenceText.textContent = language() === "fr" && GENDER_DIFFERENCES[group.speciesId]
      ? GENDER_DIFFERENCES[group.speciesId]
      : t("genderDifferenceFallback");
  }
}
  function openVariantDialog(speciesId, preferredKey = "", { autoCloseOutside = false } = {}) {
    const group = groupsBySpecies.get(speciesId);
    if (!group || group.entries.length < 2) return;
    if (activeDialogSpecies !== speciesId) elements.variantGrid.scrollTop = 0;
    renderVariantDialog(group, preferredKey);
    showDialog(elements.variantDialog);
    if (autoCloseOutside) scheduleVariantExitClose();
  }

  function makeElement(tag, className = "", textContent = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent) node.textContent = textContent;
    return node;
  }

  function primaryEntries() {
    return [...primaryEntryBySpecies.values()];
  }

  function entryOptionLabel(entry) {
    return `#${String(entry.speciesId).padStart(4, "0")} ${localizedName(entry)} — ${variantLabel(entry, { alwaysGender: true }) || t("defaultForm")}`;
  }

  function populateEntrySelect(select, { primaryOnly = false, huntOnly = false, selectedKey = "" } = {}) {
    const entries = (primaryOnly ? primaryEntries() : DATA.entries).filter(entry =>
      !huntOnly || (!entry.exceptional && isLegallyObtainable(entry))
    );
    select.replaceChildren(new Option(t("selectPokemon"), ""));
    for (const entry of entries) select.append(new Option(entryOptionLabel(entry), entry.key));
    select.value = entryByKey.has(selectedKey) ? selectedKey : "";
  }

  function genderRatioText(species) {
    const rate = Number(species?.genderRate);
    if (rate === -1) return t("genderless");
    if (rate === 0) return `100 % ${t("male")}`;
    if (rate === 8) return `100 % ${t("female")}`;
    if (!Number.isFinite(rate)) return "—";
    const female = rate * 12.5;
    return `♂ ${100 - female} % · ♀ ${female} %`;
  }

  function renderStatList(container, stats, comparisonStats = null) {
    const list = makeElement("div", "stat-list");
    let total = 0;
    for (const identifier of STAT_ORDER) {
      const value = Number(stats?.[identifier]) || 0;
      total += value;
      const row = makeElement("div", "stat-row");
      if (comparisonStats && value > (Number(comparisonStats?.[identifier]) || 0)) row.classList.add("is-winner");
      const label = makeElement("small", "", STAT_LABELS[identifier] || identifier);
      const number = makeElement("strong", "", String(value));
      const bar = makeElement("span", "stat-bar");
      const fill = makeElement("span");
      fill.style.width = `${Math.min(100, (value / 255) * 100)}%`;
      bar.append(fill);
      row.append(label, number, bar);
      list.append(row);
    }
    const totalRow = makeElement("div", "stat-row");
    totalRow.append(makeElement("small", "", t("total")), makeElement("strong", "", String(total)), makeElement("span", "stat-bar"));
    list.append(totalRow);
    container.append(list);
  }

  const statRankingCache = new Map();
  function statRankFor(pokemonId, identifier) {
    if (!statRankingCache.has(identifier)) {
      const ranked = Object.entries(DETAILS.pokemon || {})
        .map(([id, record]) => ({ id: Number(id), value: Number(record.stats?.[identifier]) || 0 }))
        .sort((left, right) => right.value - left.value || left.id - right.id);
      let previous = null;
      let rank = 0;
      const ranks = new Map();
      ranked.forEach((item, index) => {
        if (item.value !== previous) rank = index + 1;
        ranks.set(item.id, { rank, total: ranked.length, value: item.value });
        previous = item.value;
      });
      statRankingCache.set(identifier, ranks);
    }
    return statRankingCache.get(identifier)?.get(Number(pokemonId)) || { rank: 0, total: 0, value: 0 };
  }

  function gameLearnsetRows(details, game) {
    const versionGroupIds = [...new Set(gameAliases(game.id)
      .map(versionId => Number(DETAILS.versions?.[versionId]?.versionGroupId))
      .filter(Boolean))];
    const seen = new Set();
    const rows = [];
    for (const versionGroupId of versionGroupIds) {
      for (const packed of details.pokemon?.learnsets?.[versionGroupId] || []) {
        const [moveId, methodId, level, mastery] = packed.map(Number);
        const key = `${moveId}:${methodId}:${level}:${mastery}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ moveId, methodId, level, mastery, versionGroupId });
      }
    }
    return rows.sort((left, right) => left.methodId - right.methodId || left.level - right.level
      || localizedDetailName(DETAILS.moves?.[left.moveId]).localeCompare(localizedDetailName(DETAILS.moves?.[right.moveId]), locale()));
  }

  function gameEncounterRows(details, game) {
    const rows = [];
    for (const versionId of gameAliases(game.id)) {
      for (const packed of details.pokemon?.encounters?.[versionId] || []) {
        const [areaId, min, max, methods] = packed;
        rows.push({ versionId, areaId: Number(areaId), min: Number(min), max: Number(max), methods: methods || [] });
      }
    }
    return rows;
  }

  function renderDefenseGroups(container, types) {
    const multipliers = defenseMultipliers(types);
    const groups = [
      ["weaknesses", Object.entries(multipliers).filter(([, value]) => value > 1)],
      ["resistances", Object.entries(multipliers).filter(([, value]) => value > 0 && value < 1)],
      ["immunities", Object.entries(multipliers).filter(([, value]) => value === 0)]
    ];
    let rendered = false;
    for (const [labelKey, entries] of groups) {
      if (!entries.length) continue;
      rendered = true;
      const group = makeElement("div", "defense-group");
      group.append(makeElement("strong", "", t(labelKey)));
      const pills = makeElement("div", "defense-pills");
      for (const [type, multiplier] of entries.sort((a, b) => b[1] - a[1] || localizedType(a[0]).localeCompare(localizedType(b[0]), locale()))) {
        const pill = makeElement("span", "", `${localizedType(type)} ×${multiplier}`);
        pill.dataset.multiplier = String(multiplier);
        pills.append(pill);
      }
      group.append(pills);
      container.append(group);
    }
    if (!rendered) container.append(makeElement("p", "research-note", t("neutralDamage")));
  }

  function renderPokemonInfo(entry, { revealShiny = false } = {}) {
    if (!entry) return;
    activePokemonInfoKey = entry.key;
    pokemonInfoShinyRevealed = revealShiny;
    const details = detailForEntry(entry);
    elements.pokemonInfoTitle.textContent = localizedName(entry);
    const body = document.createDocumentFragment();
    const hero = makeElement("section", "pokemon-info__hero");
    const sprite = makeElement("span", "pokemon-info__sprite");
    const shinyVisible = isShinyOwned(entry.key) || revealShiny || !spoilerHides(entry);
    spriteStyle(sprite, entry, shinyVisible, 128);
    const identity = makeElement("div");
    identity.append(
      makeElement("h3", "", localizedName(entry)),
      makeElement("p", "", `#${String(entry.speciesId).padStart(4, "0")} · ${variantLabel(entry, { alwaysGender: true }) || t("defaultForm")}`)
    );
    const types = makeElement("div", "pokemon-info__types");
    renderTypes(types, entry.types);
    identity.append(types);
    const actions = makeElement("div", "pokemon-info__actions");
    const hunt = makeElement("button", "button button--primary", t("startHunt"));
    hunt.type = "button";
    hunt.dataset.infoAction = "hunt";
    hunt.disabled = entry.exceptional || !isLegallyObtainable(entry);
    const capture = makeElement("button", "button button--ghost", t("recordCapture"));
    capture.type = "button";
    capture.dataset.infoAction = "capture";
    capture.disabled = entry.exceptional || !isLegallyObtainable(entry);
    const compare = makeElement("button", "button button--ghost", t("comparePokemon"));
    compare.type = "button";
    compare.dataset.infoAction = "compare";
    actions.append(hunt, capture, compare);
    if (spoilerHides(entry) && !revealShiny) {
      const reveal = makeElement("button", "button button--ghost", t("revealShiny"));
      reveal.type = "button";
      reveal.dataset.infoAction = "reveal";
      actions.append(reveal);
      identity.append(makeElement("p", "research-note", t("shinyHidden")));
    }
    identity.append(actions);
    hero.append(sprite, identity);
    body.append(hero);

    if (!details.pokemon && !details.species) {
      body.append(makeElement("p", "hunt-empty", t("noTechnicalData")));
      elements.pokemonInfoBody.replaceChildren(body);
      return;
    }

    const grid = makeElement("div", "pokemon-info__grid");
    const facts = makeElement("section", "info-block");
    facts.append(makeElement("h3", "", t("technicalPokedex")));
    const factGrid = makeElement("div", "fact-grid");
    const values = [
      [t("height"), details.pokemon ? `${(details.pokemon.height / 10).toLocaleString(locale(), { maximumFractionDigits: 1 })} m` : "—"],
      [t("weight"), details.pokemon ? `${(details.pokemon.weight / 10).toLocaleString(locale(), { maximumFractionDigits: 1 })} kg` : "—"],
      [t("captureRate"), details.species?.captureRate ?? "—"],
      [t("hatchCycles"), details.species?.hatchCounter ?? "—"]
    ];
    for (const [label, value] of values) {
      const item = makeElement("div");
      item.append(makeElement("small", "", String(label)), makeElement("strong", "", String(value)));
      factGrid.append(item);
    }
    facts.append(factGrid);
    if (details.pokemon?.abilities?.length) {
      const abilityGroup = makeElement("div", "ability-summary-list");
      abilityGroup.append(makeElement("h4", "", t("abilities")));
      for (const ability of details.pokemon.abilities) {
        const reference = DETAILS.abilities?.[ability.id] || ability;
        const item = makeElement("article");
        item.append(
          makeElement("strong", "", `${localizedDetailName(ability)}${ability.hidden ? ` (${t("hiddenAbility")})` : ""}`),
          makeElement("p", "", localizedTechnicalText(reference) || t("descriptionUnavailable"))
        );
        abilityGroup.append(item);
      }
      facts.append(abilityGroup);
    }

    const breeding = makeElement("section", "info-block");
    breeding.append(makeElement("h3", "", t("breeding")));
    const breedingFacts = makeElement("div", "fact-grid");
    const genderFact = makeElement("div");
    genderFact.append(makeElement("small", "", t("genderRatio")), makeElement("strong", "", genderRatioText(details.species)));
    const eggsFact = makeElement("div");
    eggsFact.append(
      makeElement("small", "", t("eggGroups")),
      makeElement("strong", "", details.species?.eggGroups?.map(localizedDetailName).filter(Boolean).join(" · ") || "—")
    );
    breedingFacts.append(genderFact, eggsFact);
    breeding.append(breedingFacts);

    const stats = makeElement("section", "info-block");
    stats.append(makeElement("h3", "", t("baseStats")));
    renderStatList(stats, details.pokemon?.stats || {});
    const rankGrid = makeElement("div", "stat-rank-grid");
    for (const identifier of STAT_ORDER) {
      const ranking = statRankFor(details.pokemonId, identifier);
      const item = makeElement("div");
      item.append(
        makeElement("small", "", STAT_LABELS[identifier] || identifier),
        makeElement("strong", "", t("rankValue", { rank: ranking.rank, total: ranking.total }))
      );
      rankGrid.append(item);
    }
    stats.append(makeElement("h4", "stat-rank-title", t("statRankings")), rankGrid);

    const defenses = makeElement("section", "info-block");
    defenses.append(makeElement("h3", "", t("typeDefenses")));
    renderDefenseGroups(defenses, entry.types);
    grid.append(facts, breeding, stats, defenses);
    body.append(grid);

    const gameSection = makeElement("section", "info-block pokemon-game-data");
    gameSection.append(makeElement("h3", "", t("gamesAvailability")));
    const availableGames = gameAvailabilityForEntry(entry);
    if (!availableGames.length) {
      gameSection.append(makeElement("p", "hunt-empty", t("noGameData")));
    } else {
      const controls = makeElement("div", "pokemon-game-data__controls");
      const label = makeElement("label", "auth-field");
      label.append(makeElement("span", "", t("gameVersion")));
      const select = makeElement("select");
      for (const game of availableGames) {
        select.append(new Option(`${localizedVersionName(game.id)} · ${t("generationShort", { generation: game.generation })}`, String(game.id)));
      }
      label.append(select);
      controls.append(label);
      const content = makeElement("div", "pokemon-game-data__content");
      const latest = availableGames.at(-1);
      select.value = String(latest.id);
      const renderSelectedGame = () => {
        const game = availableGames.find(item => String(item.id) === select.value) || latest;
        const encounterRows = gameEncounterRows(details, game);
        const learnsetRows = gameLearnsetRows(details, game);
        const fragment = document.createDocumentFragment();
        const status = makeElement("div", "availability-status");
        status.dataset.status = game.direct ? "direct" : "present";
        status.append(
          makeElement("strong", "", game.direct ? t("wildCaptureDocumented") : t("presentInGame")),
          makeElement("span", "", game.direct ? t("wildCaptureDocumentedDesc") : t("presentInGameDesc"))
        );
        fragment.append(status);

        const locations = makeElement("section", "technical-subsection");
        locations.append(makeElement("h4", "", t("whereAndHow")));
        if (encounterRows.length) {
          const list = makeElement("div", "encounter-list");
          for (const row of encounterRows) {
            const item = makeElement("article");
            const methodLabels = row.methods.map(([methodId, rarity]) => {
              const method = DETAILS.encounterMethods?.[methodId];
              return `${localizedDetailName(method) || method?.identifier || t("encounter")} · ${rarity || "?"} %`;
            });
            item.append(
              makeElement("strong", "", localizedDetailName(DETAILS.locations?.[row.areaId]) || `#${row.areaId}`),
              makeElement("span", "", `${localizedVersionName(row.versionId)} · ${t("levels", { min: row.min, max: row.max })}`),
              makeElement("small", "", methodLabels.join(" · "))
            );
            list.append(item);
          }
          locations.append(list);
        } else locations.append(makeElement("p", "research-note", game.generation >= 8
          ? t("modernLocationDataMissing")
          : t("noWildEncounterDocumented")));
        fragment.append(locations);

        const movesBlock = makeElement("section", "technical-subsection");
        movesBlock.append(makeElement("h4", "", t("learnableMoves")));
        if (!learnsetRows.length) movesBlock.append(makeElement("p", "research-note", t("noLearnsetForGame")));
        else {
          const table = makeElement("div", "pokemon-move-table");
          for (const row of learnsetRows) {
            const move = DETAILS.moves?.[row.moveId];
            if (!move) continue;
            const method = DETAILS.moveMethods?.[row.methodId];
            const item = makeElement("details");
            const summary = makeElement("summary");
            const type = makeElement("span", "type-pill", localizedType(move.type));
            type.dataset.type = move.type;
            type.style.setProperty("--type-color", TYPE_COLORS[move.type] || "#64748b");
            typeContainerTextColor(type, move.type);
            const methodText = [localizedDetailName(method) || method?.identifier, row.level ? t("levelShort", { level: row.level }) : "", row.mastery ? t("masteryLevel", { level: row.mastery }) : ""].filter(Boolean).join(" · ");
            summary.append(
              makeElement("strong", "", localizedDetailName(move)), type,
              makeElement("span", "", `${move.power || "—"} / ${move.accuracy || "—"} / ${move.pp || "—"}`),
              makeElement("small", "", methodText)
            );
            item.append(summary, makeElement("p", "", localizedTechnicalText(move) || t("descriptionUnavailable")));
            table.append(item);
          }
          movesBlock.append(makeElement("p", "research-note", t("moveColumnsHint")), table);
        }
        fragment.append(movesBlock);
        content.replaceChildren(fragment);
      };
      select.addEventListener("change", renderSelectedGame);
      renderSelectedGame();
      gameSection.append(controls, content);
    }
    body.append(gameSection);
    elements.pokemonInfoBody.replaceChildren(body);
  }

  function openPokemonInfo(entryKey) {
    const entry = entryByKey.get(entryKey);
    if (!entry) return;
    renderPokemonInfo(entry);
    showDialog(elements.pokemonInfoDialog);
  }

  function huntGameLabel(value) {
    const game = GAME_EDITION_BY_ID.get(Number(value));
    return game ? localizedVersionName(game.id) : String(value || "");
  }

  function updateHuntEditorAvailability({ selectedGame = "", selectedMethod = "" } = {}) {
    const entry = entryByKey.get(elements.huntEntrySelect.value);
    const games = entry ? gameAvailabilityForEntry(entry).filter(game => game.methods.length) : [];
    elements.huntGame.replaceChildren(new Option(t("selectGame"), ""));
    const groups = new Map();
    for (const game of games) {
      const group = groups.get(game.generation) || document.createElement("optgroup");
      group.label = t("generationShort", { generation: game.generation });
      group.append(new Option(`${localizedVersionName(game.id)}${game.direct ? ` · ${t("wildCapture")}` : ""}`, String(game.id)));
      groups.set(game.generation, group);
    }
    elements.huntGame.append(...groups.values());
    if (selectedGame && ![...elements.huntGame.options].some(option => option.value === String(selectedGame))) {
      elements.huntGame.append(new Option(`${huntGameLabel(selectedGame)} · ${t("legacyEntry")}`, String(selectedGame)));
    }
    elements.huntGame.value = String(selectedGame || "");
    if (!elements.huntGame.value && games.length === 1) elements.huntGame.value = String(games[0].id);

    const selectedGameRecord = games.find(game => String(game.id) === elements.huntGame.value);
    const mode = elements.huntRecordMode.value === "caught" ? "caught" : "active";
    const methods = entry && selectedGameRecord ? huntMethodsFor(entry, selectedGameRecord, mode) : [];
    elements.huntMethod.replaceChildren(...methods.map(key => new Option(huntMethodLabel(key), key)));
    if (selectedMethod && !methods.includes(selectedMethod)) {
      elements.huntMethod.append(new Option(`${huntMethodLabel(selectedMethod)} · ${t("legacyEntry")}`, selectedMethod));
    }
    elements.huntMethod.value = methods.includes(selectedMethod) ? selectedMethod : (selectedMethod || methods[0] || "");

    if (!entry) elements.huntAvailabilityNote.textContent = t("huntChoosePokemonFirst");
    else if (!games.length) elements.huntAvailabilityNote.textContent = t("huntNoCompatibleGame");
    else if (!selectedGameRecord) elements.huntAvailabilityNote.textContent = t("huntChooseGame");
    else elements.huntAvailabilityNote.textContent = selectedGameRecord.direct
      ? t("huntDirectAvailability", { game: localizedVersionName(selectedGameRecord.id) })
      : t("huntPresenceAvailability", { game: localizedVersionName(selectedGameRecord.id) });
  }

  function openHuntEditor(mode = "active", entryKey = "", recordId = "") {
    const record = recordId ? state.huntRecords[recordId] : null;
    populateEntrySelect(elements.huntEntrySelect, { huntOnly: true, selectedKey: record?.entryKey || entryKey });
    elements.huntRecordId.value = record?.id || "";
    elements.huntRecordMode.value = mode;
    elements.huntEntrySelect.disabled = Boolean(record);
    updateHuntEditorAvailability({ selectedGame: record?.game || "", selectedMethod: record?.method || "" });
    elements.huntAttempts.value = String(record?.attempts || 0);
    elements.huntDate.value = mode === "caught" ? (record?.caughtAt || todayDate()) : (record?.startedAt || todayDate());
    elements.huntNickname.value = record?.nickname || "";
    elements.huntNotes.value = record?.notes || "";
    elements.huntDateLabel.textContent = t(mode === "caught" ? "caughtDate" : "startDate");
    elements.huntEditorTitle.textContent = t(record ? "edit" : mode === "caught" ? "addCapture" : "newHunt");
    showDialog(elements.huntEditorDialog);
  }

  function activeHuntRecords() {
    return Object.values(state.huntRecords).filter(record => record.status === "active")
      .sort((a, b) => (a.startedAt || "9999").localeCompare(b.startedAt || "9999") || b.updatedAt - a.updatedAt);
  }

  function caughtHuntRecords() {
    return Object.values(state.huntRecords).filter(record => record.status === "caught")
      .sort((a, b) => (b.caughtAt || "").localeCompare(a.caughtAt || "") || b.updatedAt - a.updatedAt);
  }

  function renderHuntCard(record, caught = false) {
    const entry = entryByKey.get(record.entryKey);
    const card = makeElement("article", caught ? "capture-card" : "hunt-card");
    card.dataset.recordId = record.id;
    const sprite = makeElement("span", "hunt-card__sprite");
    spriteStyle(sprite, entry, caught || !spoilerHides(entry), 72);
    const body = makeElement("div", "hunt-card__body");
    body.append(makeElement("h4", "", record.nickname || localizedName(entry)));
    const metadata = [variantLabel(entry, { alwaysGender: true }), huntGameLabel(record.game), huntMethodLabel(record.method), caught ? record.caughtAt : record.startedAt]
      .filter(Boolean).join(" · ");
    body.append(makeElement("p", "hunt-card__meta", metadata));
    const counter = makeElement("div", "hunt-counter");
    counter.append(makeElement("strong", "", formatNumber(record.attempts)));
    if (!caught) {
      for (const amount of [1, 10]) {
        const button = makeElement("button", "", `+${amount}`);
        button.type = "button";
        button.dataset.huntAction = "increment";
        button.dataset.amount = String(amount);
        counter.append(button);
      }
    }
    body.append(counter);
    const actions = makeElement("div", "hunt-card__actions");
    const edit = makeElement("button", "", t("edit"));
    edit.type = "button";
    edit.dataset.huntAction = "edit";
    actions.append(edit);
    if (!caught) {
      const complete = makeElement("button", "is-complete", t("complete"));
      complete.type = "button";
      complete.dataset.huntAction = "complete";
      actions.append(complete);
    }
    const discard = makeElement("button", "", t("discard"));
    discard.type = "button";
    discard.dataset.huntAction = "discard";
    actions.append(discard);
    body.append(actions);
    card.append(sprite, body);
    return card;
  }

  function renderHunts() {
    const active = activeHuntRecords();
    const caught = caughtHuntRecords();
    elements.activeHuntCount.textContent = String(active.length);
    elements.huntDialogActiveCount.textContent = formatNumber(active.length);
    elements.captureJournalCount.textContent = formatNumber(caught.length);
    elements.activeHuntList.replaceChildren(...active.map(record => renderHuntCard(record)));
    elements.captureJournalList.replaceChildren(...caught.map(record => renderHuntCard(record, true)));
    elements.activeHuntEmpty.hidden = active.length > 0;
    elements.captureJournalEmpty.hidden = caught.length > 0;
  }

  function updateHuntRecord(recordId, changes) {
    const record = state.huntRecords[recordId];
    if (!record) return;
    state.huntRecords[recordId] = { ...record, ...changes, updatedAt: Date.now() };
    saveState();
    renderHunts();
  }

  function completeHunt(recordId) {
    const record = state.huntRecords[recordId];
    if (!record || record.status !== "active") return;
    state.huntRecords[recordId] = { ...record, status: "caught", caughtAt: todayDate(), updatedAt: Date.now() };
    setQuantity(record.entryKey, quantityFor(record.entryKey) + 1, { sparkle: true });
    renderHunts();
    showToast(t("huntCompleted"));
  }

  function handleHuntAction(event) {
    const button = event.target.closest("[data-hunt-action]");
    const card = button?.closest("[data-record-id]");
    const record = card ? state.huntRecords[card.dataset.recordId] : null;
    if (!button || !record) return;
    const action = button.dataset.huntAction;
    if (action === "increment") {
      updateHuntRecord(record.id, { attempts: Math.min(999999999, record.attempts + Number(button.dataset.amount || 1)) });
    } else if (action === "edit") {
      openHuntEditor(record.status === "caught" ? "caught" : "active", record.entryKey, record.id);
    } else if (action === "complete") {
      completeHunt(record.id);
    } else if (action === "discard") {
      updateHuntRecord(record.id, { status: "discarded" });
      showToast(t("huntRemoved"));
    }
  }

  function openHuntBook() {
    renderHunts();
    showDialog(elements.huntDialog);
  }

  function renderGallery(entryKey = "") {
    const entry = entryByKey.get(entryKey) || primaryEntries()[0];
    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("choosePokemon")));
    const select = makeElement("select");
    populateEntrySelect(select, { selectedKey: entry.key });
    field.append(select);
    controls.append(field);
    const gallery = makeElement("div", "gallery-grid");
    for (const [mode, shiny, label] of [["2d", false, `2D · ${t("normalSprite")}`], ["2d", true, `2D · ${t("shinySprite")}`], ["3d", false, `3D · ${t("normalSprite")}`], ["3d", true, `3D · ${t("shinySprite")}`]]) {
      const card = makeElement("article", "gallery-card");
      const sprite = makeElement("span", "gallery-sprite");
      spriteStyle(sprite, entry, shiny, 128, mode);
      if (shiny && spoilerHides(entry)) sprite.style.filter = "brightness(0) drop-shadow(0 10px 10px rgba(3, 8, 18, 0.35))";
      card.append(sprite, makeElement("strong", "", label));
      gallery.append(card);
    }
    select.addEventListener("change", () => renderResearchTool("gallery", { entryKey: select.value }));
    elements.researchDialogBody.replaceChildren(controls, makeElement("p", "research-note", t("galleryHint")), gallery);
  }

  function renderPokedexSearch(entryKey = "") {
    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("searchPokedex")));
    const select = makeElement("select");
    populateEntrySelect(select, { selectedKey: entryKey });
    field.append(select);
    const button = makeElement("button", "button button--primary", t("technicalPokedex"));
    button.type = "button";
    button.disabled = !entryKey;
    select.addEventListener("change", () => { button.disabled = !select.value; });
    button.addEventListener("click", () => openPokemonInfo(select.value));
    controls.append(field, button);
    elements.researchDialogBody.replaceChildren(controls);
  }

  function renderLineageSearch(entryKey = "") {
    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("choosePokemon")));
    const select = makeElement("select");
    populateEntrySelect(select, { primaryOnly: true, selectedKey: entryKey });
    field.append(select);
    const button = makeElement("button", "button button--primary", t("applyLineageSearch"));
    button.type = "button";
    button.disabled = !entryKey;
    select.addEventListener("change", () => { button.disabled = !select.value; });
    button.addEventListener("click", () => {
      const entry = entryByKey.get(select.value);
      if (!entry) return;
      closeDialog(elements.researchDialog);
      applyLineageFilter(entry.speciesId);
    });
    controls.append(field, button);
    elements.researchDialogBody.replaceChildren(controls);
  }

  function renderComparison(firstKey = "", secondKey = "") {
    const defaults = primaryEntries();
    const first = entryByKey.get(firstKey) || defaults.find(entry => entry.speciesId === 6) || defaults[0];
    const second = entryByKey.get(secondKey) || defaults.find(entry => entry.speciesId === 9) || defaults[1];
    const controls = makeElement("div", "research-controls");
    const selects = [];
    for (const [label, entry] of [[t("firstPokemon"), first], [t("secondPokemon"), second]]) {
      const field = makeElement("label", "auth-field");
      field.append(makeElement("span", "", label));
      const select = makeElement("select");
      populateEntrySelect(select, { primaryOnly: true, selectedKey: entry.key });
      field.append(select);
      controls.append(field);
      selects.push(select);
    }
    const grid = makeElement("div", "comparison-grid");
    const firstStats = detailForEntry(first).pokemon?.stats || {};
    const secondStats = detailForEntry(second).pokemon?.stats || {};
    for (const [entry, stats, otherStats] of [[first, firstStats, secondStats], [second, secondStats, firstStats]]) {
      const card = makeElement("article", "comparison-card");
      card.append(makeElement("h3", "", localizedName(entry)));
      renderStatList(card, stats, otherStats);
      grid.append(card);
    }
    for (const select of selects) select.addEventListener("change", () => renderResearchTool("compare", { firstKey: selects[0].value, secondKey: selects[1].value }));
    elements.researchDialogBody.replaceChildren(controls, grid);
  }

  function renderTypeTool(firstType = "normal", secondType = "") {
    const controls = makeElement("div", "research-controls");
    const selects = [];
    for (const [label, value, optional] of [[t("defendingTypeOne"), firstType, false], [t("defendingTypeTwo"), secondType, true]]) {
      const field = makeElement("label", "auth-field");
      field.append(makeElement("span", "", label));
      const select = makeElement("select");
      if (optional) select.append(new Option(t("noSecondType"), ""));
      for (const type of DATA.types) select.append(new Option(localizedType(type), type));
      select.value = value;
      field.append(select);
      controls.append(field);
      selects.push(select);
    }
    const block = makeElement("section", "info-block");
    block.append(makeElement("h3", "", t("typeDefenses")));
    renderDefenseGroups(block, [selects[0].value, selects[1].value].filter(Boolean));
    for (const select of selects) select.addEventListener("change", () => renderResearchTool("types", { firstType: selects[0].value, secondType: selects[1].value }));
    elements.researchDialogBody.replaceChildren(controls, makeElement("p", "research-note", t("typeSelectHint")), block);
  }

  function renderOddsTool(values = {}) {
    const base = Math.max(2, Number(values.base) || 4096);
    const rolls = Math.max(1, Number(values.rolls) || 1);
    const encounters = Math.max(1, Number(values.encounters) || 100);
    const presets = makeElement("div", "odds-presets");
    for (const [labelKey, presetBase, presetRolls] of [["fullOddsModern", 4096, 1], ["fullOddsClassic", 8192, 1], ["shinyCharm", 4096, 3], ["masudaMethod", 4096, 6], ["masudaCharm", 4096, 8]]) {
      const button = makeElement("button", "", t(labelKey));
      button.type = "button";
      button.addEventListener("click", () => renderResearchTool("odds", { base: presetBase, rolls: presetRolls, encounters }));
      presets.append(button);
    }
    const controls = makeElement("div", "research-controls");
    const inputs = [];
    for (const [labelKey, value, minimum] of [["baseDenominator", base, 2], ["independentRolls", rolls, 1], ["encounters", encounters, 1]]) {
      const field = makeElement("label", "auth-field");
      field.append(makeElement("span", "", t(labelKey)));
      const input = makeElement("input");
      input.type = "number";
      input.min = String(minimum);
      input.max = "999999999";
      input.value = String(value);
      field.append(input);
      controls.append(field);
      inputs.push(input);
    }
    const probability = 1 - Math.pow(1 - 1 / base, rolls);
    const cumulative = 1 - Math.pow(1 - probability, encounters);
    const percentage = value => `${(value * 100).toLocaleString(locale(), { maximumFractionDigits: 6 })} %`;
    const result = makeElement("div", "odds-result");
    for (const [label, value] of [
      [t("chancePerEncounter"), percentage(probability)],
      [t("averageOneIn", { count: Math.round(1 / probability).toLocaleString(locale()) }), `1/${Math.round(1 / probability).toLocaleString(locale())}`],
      [t("cumulativeChance", { count: encounters.toLocaleString(locale()) }), percentage(cumulative)]
    ]) {
      const item = makeElement("div");
      item.append(makeElement("small", "", label), makeElement("strong", "", value));
      result.append(item);
    }
    for (const input of inputs) input.addEventListener("change", () => renderResearchTool("odds", {
      base: inputs[0].value, rolls: inputs[1].value, encounters: inputs[2].value
    }));
    elements.researchDialogBody.replaceChildren(presets, controls, result, makeElement("p", "research-note", t("probabilityNote")));
  }

  function renderMethodsTool() {
    const grid = makeElement("div", "method-grid");
    for (const key of HUNT_METHOD_KEYS.filter(key => !["Other", "Distribution"].includes(key))) {
      const card = makeElement("article", "method-card");
      card.append(makeElement("h3", "", huntMethodLabel(key)), makeElement("p", "", t(`methodDescription${key}`)));
      const steps = makeElement("ol", "method-tutorial");
      for (const step of t(`methodTutorial${key}`).split("|").filter(Boolean)) steps.append(makeElement("li", "", step));
      card.append(steps);
      const compatibleGames = GAME_EDITION_DEFINITIONS.filter(game => game.methods.includes(key));
      const details = makeElement("details", "method-games");
      details.append(makeElement("summary", "", t("compatibleGames", { count: compatibleGames.length })));
      const list = makeElement("div");
      for (const game of compatibleGames) list.append(makeElement("span", "", localizedVersionName(game.id)));
      details.append(list);
      card.append(details);
      grid.append(card);
    }
    elements.researchDialogBody.replaceChildren(makeElement("p", "research-note", t("methodRestrictionHint")), grid);
  }

  function gameSpeciesCount(game, directOnly = false) {
    const aliases = new Set(gameAliases(game.id));
    const speciesIds = new Set();
    for (const record of Object.values(DETAILS.pokemon || {})) {
      const matched = directOnly
        ? Object.keys(record.encounters || {}).some(versionId => aliases.has(Number(versionId)))
        : (record.gameVersionIds || []).some(versionId => aliases.has(Number(versionId)));
      if (matched) speciesIds.add(Number(record.speciesId));
    }
    return speciesIds.size;
  }

  function renderGamesTool(gameId = "", generation = "") {
    const selected = GAME_EDITION_BY_ID.get(Number(gameId));
    if (selected) {
      const back = makeElement("button", "button button--ghost", t("backToGames"));
      back.type = "button";
      back.addEventListener("click", () => renderResearchTool("games"));
      const hero = makeElement("section", "game-detail-hero");
      hero.style.setProperty("--game-color", selected.color);
      const mascot = primaryEntryBySpecies.get(selected.mascotSpeciesId);
      const sprite = makeElement("span", "game-card__sprite");
      if (mascot) spriteStyle(sprite, mascot, false, 128);
      const identity = makeElement("div");
      identity.append(
        makeElement("p", "eyebrow", t("generationShort", { generation: gameGeneration(selected) })),
        makeElement("h3", "", localizedVersionName(selected.id)),
        makeElement("p", "", `${selected.year} · ${selected.platform} · ${selected.region}`)
      );
      hero.append(sprite, identity);
      const facts = makeElement("div", "game-fact-grid");
      for (const [label, value] of [
        [t("pokemonPresent"), gameSpeciesCount(selected).toLocaleString(locale())],
        [t("wildCapturesDocumented"), gameSpeciesCount(selected, true).toLocaleString(locale())],
        [t("shinyHunting"), selected.methods.length ? t("available") : t("unavailable")]
      ]) {
        const fact = makeElement("div");
        fact.append(makeElement("small", "", label), makeElement("strong", "", value));
        facts.append(fact);
      }
      const guide = makeElement("section", "info-block game-guide");
      guide.append(makeElement("h3", "", t("gameGuide")), makeElement("p", "", t(`gameGuide${selected.family}`)));
      const tutorial = makeElement("ol");
      for (const step of t(`gameTutorial${selected.family}`).split("|").filter(Boolean)) tutorial.append(makeElement("li", "", step));
      guide.append(tutorial);
      const methods = makeElement("section", "info-block game-guide");
      methods.append(makeElement("h3", "", t("huntingMethods")));
      if (!selected.methods.length) methods.append(makeElement("p", "research-note", t("noShinyInGenerationOne")));
      else {
        const list = makeElement("div", "game-method-list");
        for (const key of selected.methods) {
          const item = makeElement("article");
          item.append(makeElement("strong", "", huntMethodLabel(key)), makeElement("p", "", t(`methodDescription${key}`)));
          list.append(item);
        }
        methods.append(list);
      }
      elements.researchDialogBody.replaceChildren(back, hero, facts, guide, methods, makeElement("p", "research-note", t("gameDataSourceNote")));
      return;
    }

    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("generationFilterLabel")));
    const select = makeElement("select");
    select.append(new Option(t("allGenerations"), ""));
    for (const value of [...new Set(GAME_EDITION_DEFINITIONS.map(gameGeneration))].sort((a, b) => a - b)) {
      select.append(new Option(t("generationShort", { generation: value }), String(value)));
    }
    select.value = String(generation || "");
    field.append(select);
    controls.append(field);
    select.addEventListener("change", () => renderResearchTool("games", { generation: select.value }));
    const games = GAME_EDITION_DEFINITIONS.filter(game => !generation || gameGeneration(game) === Number(generation))
      .sort((left, right) => left.year - right.year || left.id - right.id);
    const grid = makeElement("div", "game-grid");
    for (const game of games) {
      const button = makeElement("button", "game-card");
      button.type = "button";
      button.style.setProperty("--game-color", game.color);
      const mascot = primaryEntryBySpecies.get(game.mascotSpeciesId);
      const sprite = makeElement("span", "game-card__sprite");
      if (mascot) spriteStyle(sprite, mascot, false, 96);
      const body = makeElement("span", "game-card__body");
      body.append(
        makeElement("small", "", `${t("generationShort", { generation: gameGeneration(game) })} · ${game.year}`),
        makeElement("strong", "", localizedVersionName(game.id)),
        makeElement("span", "", `${game.platform} · ${game.region}`)
      );
      button.append(sprite, body);
      button.addEventListener("click", () => renderResearchTool("games", { gameId: game.id }));
      grid.append(button);
    }
    elements.researchDialogBody.replaceChildren(controls, makeElement("p", "research-note", t("mainSeriesGamesIntro")), grid);
  }

  function renderCatalogueControls({ search = "", category = "", categories = [] } = {}, rerender) {
    const controls = makeElement("div", "research-controls");
    const searchField = makeElement("label", "auth-field");
    searchField.append(makeElement("span", "", t("catalogueSearch")));
    const searchInput = makeElement("input");
    searchInput.type = "search";
    searchInput.value = search;
    searchField.append(searchInput);
    controls.append(searchField);
    let categorySelect = null;
    if (categories.length) {
      const field = makeElement("label", "auth-field");
      field.append(makeElement("span", "", t("category")));
      categorySelect = makeElement("select");
      categorySelect.append(new Option(t("allCategories"), ""));
      for (const option of categories) categorySelect.append(new Option(option.label, option.value));
      categorySelect.value = category;
      field.append(categorySelect);
      controls.append(field);
    }
    let timer;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => rerender(searchInput.value, categorySelect?.value || ""), 120);
    });
    categorySelect?.addEventListener("change", () => rerender(searchInput.value, categorySelect.value));
    return controls;
  }

  function renderAbilitiesTool(search = "", generation = "") {
    const query = normalize(search);
    const entries = Object.entries(DETAILS.abilities || {})
      .map(([id, ability]) => {
        const speciesIds = [...new Set((ability.pokemonIds || []).map(pokemonId => DETAILS.pokemon?.[pokemonId]?.speciesId).filter(Boolean))];
        const pokemonNames = speciesIds.map(speciesId => localizedName(groupsBySpecies.get(speciesId)?.entries?.[0] || {})).filter(Boolean);
        return { id: Number(id), ...ability, label: localizedDetailName(ability), speciesIds, pokemonNames };
      })
      .filter(ability => (!generation || Number(generation) === ability.generation)
        && (!query || [ability.label, localizedTechnicalText(ability), ...ability.pokemonNames]
          .some(value => normalize(value).includes(query))))
      .sort((a, b) => a.label.localeCompare(b.label, locale()));
    const generations = [...new Set(Object.values(DETAILS.abilities || {}).map(ability => Number(ability.generation)).filter(Boolean))]
      .sort((a, b) => a - b).map(value => ({ value: String(value), label: t("generationShort", { generation: value }) }));
    const controls = renderCatalogueControls({ search, category: String(generation || ""), categories: generations },
      (nextSearch, nextGeneration) => renderResearchTool("abilities", { search: nextSearch, generation: nextGeneration }));
    controls.querySelector("input").placeholder = t("abilitySearchPlaceholder");
    const grid = makeElement("div", "catalogue-grid ability-catalogue-grid");
    for (const ability of entries) {
      const card = makeElement("article", "catalogue-card");
      card.append(
        makeElement("h3", "", ability.label),
        makeElement("small", "catalogue-generation", ability.sourceGame === "pokemon-conquest"
          ? "Pokémon Conquest"
          : t("generationShort", { generation: ability.generation })),
        makeElement("p", "catalogue-effect", localizedTechnicalText(ability) || t("descriptionUnavailable"))
      );
      const compatible = makeElement("details", "catalogue-compatible");
      compatible.append(makeElement("summary", "", t("pokemonCount", { count: ability.speciesIds.length.toLocaleString(locale()) })));
      const pokemonGrid = makeElement("div", "catalogue-pokemon-list");
      for (const speciesId of ability.speciesIds) {
        const entry = primaryEntryBySpecies.get(speciesId);
        if (!entry) continue;
        const button = makeElement("button", "", localizedName(entry));
        button.type = "button";
        button.addEventListener("click", () => {
          closeDialog(elements.researchDialog);
          openPokemonInfo(entry.key);
        });
        pokemonGrid.append(button);
      }
      compatible.append(pokemonGrid);
      card.append(compatible);
      grid.append(card);
    }
    const nodes = [controls, makeElement("p", "research-note", t("resultCountExact", { count: entries.length.toLocaleString(locale()) })), grid];
    if (!entries.length) nodes.push(makeElement("p", "hunt-empty", t("noResults")));
    elements.researchDialogBody.replaceChildren(...nodes);
  }

  function renderMovesTool(search = "", type = "", sort = "name") {
    const query = normalize(search);
    const entries = Object.entries(DETAILS.moves || {})
      .map(([id, move]) => ({ id: Number(id), ...move, label: localizedDetailName(move) }))
      .filter(move => (!query || [move.label, localizedTechnicalText(move), t(move.damageClass)]
        .some(value => normalize(value).includes(query))) && (!type || move.type === type))
      .sort((left, right) => {
        if (["power", "accuracy", "pp", "generation"].includes(sort)) {
          return (Number(right[sort]) || 0) - (Number(left[sort]) || 0) || left.label.localeCompare(right.label, locale());
        }
        if (sort === "type") return localizedType(left.type).localeCompare(localizedType(right.type), locale()) || left.label.localeCompare(right.label, locale());
        if (sort === "category") return t(left.damageClass).localeCompare(t(right.damageClass), locale()) || left.label.localeCompare(right.label, locale());
        return left.label.localeCompare(right.label, locale());
      });
    const categories = DATA.types.map(value => ({ value, label: localizedType(value) }));
    const controls = renderCatalogueControls({ search, category: type, categories },
      (nextSearch, nextType) => renderResearchTool("moves", { search: nextSearch, type: nextType, sort }));
    const sortField = makeElement("label", "auth-field");
    sortField.append(makeElement("span", "", t("sortBy")));
    const sortSelect = makeElement("select");
    for (const [value, labelKey] of [["name", "sortName"], ["type", "type"], ["category", "category"], ["power", "movePower"], ["accuracy", "moveAccuracy"], ["pp", "movePp"], ["generation", "generationLabel"]]) {
      sortSelect.append(new Option(t(labelKey), value));
    }
    sortSelect.value = sort;
    sortField.append(sortSelect);
    controls.append(sortField);
    sortSelect.addEventListener("change", () => renderResearchTool("moves", { search, type, sort: sortSelect.value }));
    const table = makeElement("div", "catalogue-table");
    for (const move of entries) {
      const row = makeElement("article");
      const typePill = makeElement("span", "type-pill", localizedType(move.type));
      typePill.dataset.type = move.type;
      typePill.style.setProperty("--type-color", TYPE_COLORS[move.type] || "#64748b");
      typeContainerTextColor(typePill, move.type);
      row.append(
        makeElement("strong", "", move.label), typePill,
        makeElement("span", "", `${t("movePower")} ${move.power || "—"}`),
        makeElement("span", "", `${t("moveAccuracy")} ${move.accuracy ? `${move.accuracy} %` : "—"}`),
        makeElement("span", "", `${t("movePp")} ${move.pp || "—"}`),
        makeElement("small", "", `${t(move.damageClass)} · ${t("generationShort", { generation: move.generation })}`),
        makeElement("p", "catalogue-move-effect", localizedTechnicalText(move) || t("descriptionUnavailable"))
      );
      table.append(row);
    }
    elements.researchDialogBody.replaceChildren(controls, makeElement("p", "research-note", t("resultCountExact", { count: entries.length.toLocaleString(locale()) })), table,
      ...(!entries.length ? [makeElement("p", "hunt-empty", t("noResults"))] : []));
  }

  function renderNaturesTool() {
    const stats = ["attack", "defense", "special-attack", "special-defense", "speed"];
    const natures = Object.values(DETAILS.natures || {});
    const table = makeElement("div", "nature-matrix");
    const corner = makeElement("div", "nature-matrix__corner");
    corner.append(makeElement("span", "", `↑ ${t("increasedStat")}`), makeElement("span", "", `↓ ${t("decreasedStat")}`));
    table.append(corner);
    for (const decreased of stats) table.append(makeElement("strong", "nature-matrix__heading", `↓ ${STAT_LABELS[decreased]}`));
    for (const increased of stats) {
      table.append(makeElement("strong", "nature-matrix__heading", `↑ ${STAT_LABELS[increased]}`));
      for (const decreased of stats) {
        const nature = natures.find(item => item.increasedStat === increased && item.decreasedStat === decreased);
        const cell = makeElement("div", `nature-matrix__cell${increased === decreased ? " is-neutral" : ""}`);
        cell.append(makeElement("strong", "", localizedDetailName(nature) || "—"));
        if (increased === decreased) cell.append(makeElement("small", "", t("neutralNature")));
        else cell.append(makeElement("small", "", `↑ ${STAT_LABELS[increased]} · ↓ ${STAT_LABELS[decreased]}`));
        table.append(cell);
      }
    }
    elements.researchDialogBody.replaceChildren(
      makeElement("p", "research-note", t("natureMatrixHint")),
      makeElement("div", "nature-matrix-scroll")
    );
    elements.researchDialogBody.querySelector(".nature-matrix-scroll").append(table);
  }

  function renderRankingsTool(stat = "hp") {
    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("rankingBy")));
    const select = makeElement("select");
    for (const identifier of STAT_ORDER) select.append(new Option(STAT_LABELS[identifier], identifier));
    select.value = STAT_ORDER.includes(stat) ? stat : "hp";
    field.append(select);
    controls.append(field);
    const ranked = primaryEntries().map(entry => ({ entry, value: Number(detailForEntry(entry).pokemon?.stats?.[select.value]) || 0 }))
      .sort((a, b) => b.value - a.value || a.entry.speciesId - b.entry.speciesId).slice(0, 50);
    const table = makeElement("div", "ranking-table");
    ranked.forEach((item, index) => {
      const row = makeElement("button");
      row.type = "button";
      row.addEventListener("click", () => openPokemonInfo(item.entry.key));
      const sprite = makeElement("span", "ranking-sprite");
      spriteStyle(sprite, item.entry, isShinyOwned(item.entry.key), 52);
      row.append(makeElement("strong", "", `#${index + 1}`), sprite, makeElement("span", "", localizedName(item.entry)), makeElement("em", "", String(item.value)));
      table.append(row);
    });
    select.addEventListener("change", () => renderResearchTool("rankings", { stat: select.value }));
    elements.researchDialogBody.replaceChildren(controls, table);
  }

  function renderEggGroupsTool(groupId = "") {
    const groups = new Map();
    for (const [speciesId, species] of Object.entries(DETAILS.species || {})) {
      for (const group of species.eggGroups || []) {
        const record = groups.get(group.id) || { ...group, speciesIds: [] };
        record.speciesIds.push(Number(speciesId));
        groups.set(group.id, record);
      }
    }
    const options = [...groups.values()].sort((a, b) => localizedDetailName(a).localeCompare(localizedDetailName(b), locale()));
    const selected = groups.get(Number(groupId)) || options[0];
    const controls = makeElement("div", "research-controls");
    const field = makeElement("label", "auth-field");
    field.append(makeElement("span", "", t("eggGroups")));
    const select = makeElement("select");
    for (const group of options) select.append(new Option(localizedDetailName(group), String(group.id)));
    select.value = String(selected?.id || "");
    field.append(select);
    controls.append(field);
    const grid = makeElement("div", "egg-species-grid");
    for (const speciesId of selected?.speciesIds || []) {
      const entry = primaryEntryBySpecies.get(speciesId);
      if (!entry) continue;
      const button = makeElement("button");
      button.type = "button";
      button.addEventListener("click", () => openPokemonInfo(entry.key));
      const sprite = makeElement("span", "ranking-sprite");
      spriteStyle(sprite, entry, isShinyOwned(entry.key), 52);
      button.append(sprite, makeElement("strong", "", localizedName(entry)));
      grid.append(button);
    }
    select.addEventListener("change", () => renderResearchTool("eggGroups", { groupId: select.value }));
    elements.researchDialogBody.replaceChildren(controls, grid);
  }

  function renderResearchTool(tool, options = {}) {
    activeResearchTool = tool;
    const titleKey = {
      pokedex: "technicalPokedex", lineage: "evolutionLines", gallery: "spriteGallery", compare: "comparePokemon",
      types: "typeChart", odds: "shinyCalculator", methods: "huntingMethods", games: "gameDex",
      abilities: "abilityDex", moves: "moveDex", natures: "natureDex", rankings: "statRankings",
      eggGroups: "eggGroupDex"
    }[tool] || "explorerTitle";
    elements.researchDialogTitle.textContent = t(titleKey);
    if (tool === "pokedex") renderPokedexSearch(options.entryKey);
    else if (tool === "lineage") renderLineageSearch(options.entryKey);
    else if (tool === "gallery") renderGallery(options.entryKey);
    else if (tool === "compare") renderComparison(options.firstKey, options.secondKey);
    else if (tool === "types") renderTypeTool(options.firstType, options.secondType);
    else if (tool === "odds") renderOddsTool(options);
    else if (tool === "methods") renderMethodsTool();
    else if (tool === "games") renderGamesTool(options.gameId, options.generation);
    else if (tool === "abilities") renderAbilitiesTool(options.search, options.generation);
    else if (tool === "moves") renderMovesTool(options.search, options.type, options.sort);
    else if (tool === "natures") renderNaturesTool();
    else if (tool === "rankings") renderRankingsTool(options.stat);
    else if (tool === "eggGroups") renderEggGroupsTool(options.groupId);
  }

  function openResearchTool(tool, options = {}) {
    closeDialog(elements.explorerDialog);
    renderResearchTool(tool, options);
    showDialog(elements.researchDialog);
  }

  function handleExplorerTool(tool) {
    if (tool === "collection") {
      closeDialog(elements.explorerDialog);
      document.querySelector(".collection-panel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } else if (tool === "hunts" || tool === "journal") {
      closeDialog(elements.explorerDialog);
      openHuntBook();
      if (tool === "journal") elements.captureJournalList?.scrollIntoView?.({ block: "start" });
    } else if (tool === "distributions") {
      closeDialog(elements.explorerDialog);
      const panel = document.getElementById("informationPanel");
      panel.open = true;
      panel.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } else openResearchTool(tool);
  }

  function renderDistributionTicker(entries) {
    if (!elements.distributionTicker) return;
    const titles = entries.length
      ? entries.map(({ item }) => localizedText(item.title))
      : [t("distributionEmptyTitle")];
    const fragment = document.createDocumentFragment();

    for (let groupIndex = 0; groupIndex < 2; groupIndex += 1) {
      const group = document.createElement("span");
      group.className = "information-ticker__group";
      for (let cycle = 0; cycle < 3; cycle += 1) {
        for (const [titleIndex, titleText] of titles.entries()) {
          const title = document.createElement("span");
          title.className = "information-ticker__item";
          title.textContent = titleText;
          const separator = document.createElement("span");
          separator.className = "information-ticker__separator";
          if (titleIndex === titles.length - 1) {
            separator.classList.add("information-ticker__separator--sequence-end");
          }
          separator.textContent = "✦";
          group.append(title, separator);
        }
      }
      fragment.append(group);
    }

    const characterCount = titles.join(" · ").length * 3;
    elements.distributionTicker.style.setProperty(
      "--ticker-duration",
      `${Math.min(70, Math.max(24, characterCount * 0.18))}s`
    );
    elements.distributionTicker.replaceChildren(fragment);
  }

  function renderDistributions() {
  if (!elements.distributionGrid) return;
  const now = Date.now();
  const active = (DISTRIBUTIONS.items || [])
    .map(item => {
      const start = Date.parse(`${item.start}T00:00:00Z`);
      const end = item.end ? Date.parse(`${item.end}T23:59:59Z`) : Number.POSITIVE_INFINITY;
      const status = now < start ? "upcoming" : now <= end ? "ongoing" : "ended";
      return { item, start, end, status };
    })
    .filter(entry => entry.status !== "ended")
    .sort((a, b) => {
      const statusOrder = { ongoing: 0, upcoming: 1 };
      return statusOrder[a.status] - statusOrder[b.status] || a.start - b.start;
    });

  renderDistributionTicker(active);

  const fragment = document.createDocumentFragment();
  for (const { item, start, end, status } of active) {
    const card = document.createElement("article");
    card.className = `distribution-card distribution-card--${status}`;
    if (item.shiny) card.classList.add("distribution-card--shiny");

    const heading = document.createElement("div");
    heading.className = "distribution-card__heading";
    const statusBadge = document.createElement("span");
    statusBadge.className = "distribution-card__status";
    statusBadge.textContent = t(status === "ongoing" ? "distributionOngoing" : "distributionUpcoming");
    heading.append(statusBadge);
    if (item.shiny) {
      const shinyBadge = document.createElement("span");
      shinyBadge.className = "distribution-card__shiny";
      shinyBadge.textContent = `✦ ${t("shinyBadge")}`;
      heading.append(shinyBadge);
    }

    const title = document.createElement("h3");
    title.textContent = localizedText(item.title);
    const meta = document.createElement("p");
    meta.className = "distribution-card__meta";
    meta.textContent = `${(item.games || []).join(" · ")} · ${t("worldwide")}`;
    const method = document.createElement("strong");
    method.className = "distribution-card__method";
    method.textContent = localizedText(item.method);
    const details = document.createElement("p");
    details.className = "distribution-card__details";
    details.textContent = localizedText(item.details);
    const period = document.createElement("p");
    period.className = "distribution-card__period";
    const startText = new Date(start).toLocaleDateString(locale(), { dateStyle: "medium" });
    const endText = Number.isFinite(end)
      ? new Date(end).toLocaleDateString(locale(), { dateStyle: "medium" })
      : "";
    period.textContent = endText
      ? t("distributionPeriod", { start: startText, end: endText })
      : status === "upcoming"
        ? t("distributionStarts", { date: startText })
        : t("distributionSince", { date: startText });

    const sourceUrls = distributionSourceUrls(item);
    const sourceLink = document.createElement("a");
    sourceLink.className = "distribution-card__source";
    sourceLink.href = localizedText(sourceUrls);
    sourceLink.hreflang = sourceUrls[language()] ? language() : "en";
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    sourceLink.textContent = t("officialSource");

    card.append(heading, title, meta, method, details, period, sourceLink);
    fragment.append(card);
  }

  elements.distributionGrid.replaceChildren(fragment);
  elements.distributionEmpty.hidden = active.length > 0;
  elements.distributionCount.textContent = t(
    active.length === 1 ? "distributionCountOne" : "distributionCount",
    { count: formatNumber(active.length) }
  );
  const updatedAt = new Date(DISTRIBUTIONS.updatedAt);
  elements.distributionUpdatedAt.textContent = Number.isNaN(updatedAt.getTime())
    ? t("unknownDate")
    : updatedAt.toLocaleDateString(locale(), { dateStyle: "medium" });
}

  function applyLanguage() {
    populateLanguageOptions();
    applyStaticTranslations();
    initializeFilters();
    syncPreferences();
    updateStats();
    render();
    renderEvolutionSuggestions();
    renderCloudStatus();
    renderDistributions();
    renderHunts();
    updateDataVersion();
    if (activeDialogSpecies && elements.variantDialog.hasAttribute("open")) {
      const group = groupsBySpecies.get(activeDialogSpecies);
      if (group) renderVariantDialog(group);
    }
    if (activePokemonInfoKey && elements.pokemonInfoDialog.hasAttribute("open")) {
      renderPokemonInfo(entryByKey.get(activePokemonInfoKey), { revealShiny: pokemonInfoShinyRevealed });
    }
    if (activeResearchTool && elements.researchDialog.hasAttribute("open")) renderResearchTool(activeResearchTool);
    document.dispatchEvent(new CustomEvent("shinydex:language-change"));
  }

  function updateDataVersion() {
  const generatedDate = new Date(DATA.generatedAt);
  const base = Number.isNaN(generatedDate.getTime())
    ? t("dataVersionFallback", {
        species: formatNumber(DATA.speciesCount),
        appearances: formatNumber(DATA.appearanceCount)
      })
    : t("dataVersion", {
        date: generatedDate.toLocaleDateString(locale()),
        species: formatNumber(DATA.speciesCount),
        appearances: formatNumber(DATA.appearanceCount)
      });
  elements.dataVersion.textContent = `${base} · ${t("legalitySummary", {
    count: formatNumber(unavailableSpeciesIds.size)
  })}`;
}
  function preloadShinySheets(includeHome = spriteMode() === "3d") {
    const queue = [...DATA.shinySheets];
    if (includeHome) queue.push(...(DATA.homeNormalSheets || []), ...(DATA.homeShinySheets || []));
    const loadNext = deadline => {
      while (queue.length && (!deadline || deadline.timeRemaining() > 4)) {
        const image = new Image();
        image.decoding = "async";
        image.src = queue.shift();
      }
      if (queue.length) {
        if ("requestIdleCallback" in window) window.requestIdleCallback(loadNext, { timeout: 1500 });
        else setTimeout(() => loadNext(), 150);
      }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(loadNext, { timeout: 1000 });
    else setTimeout(() => loadNext(), 500);
  }

  function rotateVisibleVariants() {
    if (document.hidden || elements.variantDialog.hasAttribute("open")) return;
    for (const speciesId of visibleSpecies) {
      const group = groupsBySpecies.get(speciesId);
      const card = cardNodes.get(speciesId);
      if (!group || !card || group.visuals.length < 2 || card.dataset.hovering === "true") continue;
      const nextIndex = ((activeVariantIndex.get(speciesId) || 0) + 1) % group.visuals.length;
      activeVariantIndex.set(speciesId, nextIndex);
      updateCardView(group, card);
    }
  }

  elements.pokemonGrid.addEventListener("click", event => {
    const card = event.target.closest(".pokemon-card");
    if (!card) return;
    const speciesId = Number(card.dataset.speciesId);
    const group = groupsBySpecies.get(speciesId);
    const entry = currentEntry(group);
    if (event.target.closest(".pokemon-card__info")) {
      openPokemonInfo(entry.key);
    } else if (event.target.closest(".variant-badge")) {
      openVariantDialog(speciesId, entry.key, { autoCloseOutside: event.detail > 0 });
    } else if (event.target.closest(".pokemon-card__toggle")) {
      if (group.entries.length > 1) {
        openVariantDialog(speciesId, entry.key, { autoCloseOutside: event.detail > 0 });
      }
      else toggleEntry(entry.key);
    } else if (event.target.closest(".quantity__plus")) {
      incrementEntry(entry.key);
    } else if (event.target.closest(".quantity__minus")) {
      decrementEntry(entry.key);
    }
  });

  elements.pokemonGrid.addEventListener("change", event => {
    if (!event.target.matches(".quantity__input")) return;
    const key = event.target.closest(".pokemon-card")?.dataset.key;
    if (key) applyQuantityInput(key, event.target.value);
  });

  elements.variantGrid.addEventListener("click", event => {
    const option = event.target.closest(".variant-option");
    const key = option?.dataset.key;
    if (!key) return;
    if (event.target.closest(".variant-option__info")) {
      openPokemonInfo(key);
    } else if (event.target.closest(".variant-option__toggle")) {
      toggleEntry(key);
    } else if (event.target.closest(".quantity__plus")) {
      incrementEntry(key);
    } else if (event.target.closest(".quantity__minus")) {
      decrementEntry(key);
    }
  });

  elements.variantGrid.addEventListener("change", event => {
    if (!event.target.matches(".quantity__input")) return;
    const key = event.target.closest(".variant-option")?.dataset.key;
    if (key) applyQuantityInput(key, event.target.value);
  });

  elements.searchInput.addEventListener("input", scheduleRender);
  for (const control of [
    elements.generationFilter,
    elements.typeFilter,
    elements.statusFilter,
    elements.sortSelect
  ]) {
    control.addEventListener("change", render);
  }

  elements.languageSelect.addEventListener("change", event => {
    state.preferences.language = DATA.languages.includes(event.target.value) ? event.target.value : "fr";
    saveState();
    applyLanguage();
  });
  elements.clearFiltersButton.addEventListener("click", resetFilters);
  elements.emptyResetButton.addEventListener("click", resetFilters);
  elements.evolutionSuggestions.addEventListener("click", event => {
    const card = event.target.closest(".evolution-card[data-source-key]");
    if (card) openEvolutionDialog(card.dataset.sourceKey);
  });
  elements.cardSizeButton.addEventListener("click", cycleCardSize);
  elements.spriteModeButton.addEventListener("click", toggleSpriteMode);
  elements.settingsButton.addEventListener("click", () => showDialog(elements.settingsDialog));
  elements.accountButton.addEventListener("click", () => showDialog(elements.authDialog));
  elements.closeAuthButton.addEventListener("click", () => closeDialog(elements.authDialog));
  elements.closeVariantButton.addEventListener("click", () => closeDialog(elements.variantDialog));
  elements.lineageButton.addEventListener("click", () => {
    const speciesId = Number(elements.lineageButton.dataset.speciesId || activeDialogSpecies);
    if (speciesId) applyLineageFilter(speciesId);
  });
  elements.closeEvolutionButton.addEventListener("click", () => closeDialog(elements.evolutionDialog));
  elements.evolutionDialog.addEventListener("close", () => {
    activeEvolutionSourceKey = "";
  });
  elements.variantDialog.addEventListener("close", () => {
    cancelVariantExitClose();
    activeDialogSpecies = null;
  });
  const variantPanel = elements.variantDialog.querySelector(".variant-panel");
  variantPanel.addEventListener("pointerenter", event => {
    if (event.pointerType !== "touch") cancelVariantExitClose();
  });
  variantPanel.addEventListener("pointerleave", event => {
    if (event.pointerType !== "touch") scheduleVariantExitClose();
  });
  elements.variantDialog.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    if (event.target === elements.variantDialog) scheduleVariantExitClose();
  });
  elements.animationSetting.addEventListener("change", () => {
    state.preferences.animations = elements.animationSetting.checked;
    saveState();
  });
  elements.confirmSetting.addEventListener("change", () => {
    state.preferences.confirmRemove = elements.confirmSetting.checked;
    saveState();
  });
  elements.spoilerSetting.addEventListener("change", () => {
    state.preferences.spoilerGuard = elements.spoilerSetting.checked;
    saveState();
    render();
    renderHunts();
    if (activePokemonInfoKey && elements.pokemonInfoDialog.hasAttribute("open")) renderPokemonInfo(entryByKey.get(activePokemonInfoKey));
  });
  elements.explorerButton.addEventListener("click", () => showDialog(elements.explorerDialog));
  elements.closeExplorerButton.addEventListener("click", () => closeDialog(elements.explorerDialog));
  elements.explorerDialog.addEventListener("click", event => {
    const tool = event.target.closest("[data-tool]")?.dataset.tool;
    if (tool) handleExplorerTool(tool);
  });
  elements.closeResearchButton.addEventListener("click", () => closeDialog(elements.researchDialog));
  elements.closePokemonInfoButton.addEventListener("click", () => closeDialog(elements.pokemonInfoDialog));
  elements.pokemonInfoDialog.addEventListener("close", () => {
    activePokemonInfoKey = "";
    pokemonInfoShinyRevealed = false;
  });
  elements.pokemonInfoBody.addEventListener("click", event => {
    const action = event.target.closest("[data-info-action]")?.dataset.infoAction;
    const entry = entryByKey.get(activePokemonInfoKey);
    if (!action || !entry) return;
    if (action === "reveal") renderPokemonInfo(entry, { revealShiny: true });
    else if (action === "compare") {
      closeDialog(elements.pokemonInfoDialog);
      openResearchTool("compare", { firstKey: entry.key });
    }
    else if (action === "hunt" || action === "capture") {
      closeDialog(elements.pokemonInfoDialog);
      openHuntEditor(action === "capture" ? "caught" : "active", entry.key);
    }
  });
  elements.huntButton.addEventListener("click", openHuntBook);
  elements.closeHuntButton.addEventListener("click", () => closeDialog(elements.huntDialog));
  elements.newHuntButton.addEventListener("click", () => openHuntEditor("active"));
  elements.newCaptureButton.addEventListener("click", () => openHuntEditor("caught"));
  elements.closeHuntEditorButton.addEventListener("click", () => closeDialog(elements.huntEditorDialog));
  elements.cancelHuntEditorButton.addEventListener("click", () => closeDialog(elements.huntEditorDialog));
  elements.huntEntrySelect.addEventListener("change", () => updateHuntEditorAvailability());
  elements.huntGame.addEventListener("change", () => updateHuntEditorAvailability({
    selectedGame: elements.huntGame.value,
    selectedMethod: elements.huntMethod.value
  }));
  elements.activeHuntList.addEventListener("click", handleHuntAction);
  elements.captureJournalList.addEventListener("click", handleHuntAction);
  elements.huntEditorForm.addEventListener("submit", event => {
    event.preventDefault();
    const entryKey = elements.huntEntrySelect.value;
    const entry = entryByKey.get(entryKey);
    if (!entry || entry.exceptional || !isLegallyObtainable(entry)) return;
    const id = elements.huntRecordId.value || newRecordId();
    const existing = state.huntRecords[id];
    const mode = elements.huntRecordMode.value === "caught" ? "caught" : "active";
    const selectedGame = gameAvailabilityForEntry(entry).find(game => String(game.id) === elements.huntGame.value);
    const allowedMethods = selectedGame ? huntMethodsFor(entry, selectedGame, mode) : [];
    const keepsLegacyValues = Boolean(existing)
      && String(existing.game) === elements.huntGame.value
      && existing.method === elements.huntMethod.value;
    if ((!selectedGame || !allowedMethods.includes(elements.huntMethod.value)) && !keepsLegacyValues) {
      showToast(t("huntInvalidCombination"));
      return;
    }
    const date = validDateString(elements.huntDate.value) || todayDate();
    state.huntRecords[id] = {
      id,
      entryKey,
      status: mode,
      game: elements.huntGame.value.trim().slice(0, 60),
      method: HUNT_METHOD_KEYS.includes(elements.huntMethod.value) ? elements.huntMethod.value : "Other",
      attempts: Math.min(999999999, Math.max(0, Number.parseInt(elements.huntAttempts.value, 10) || 0)),
      startedAt: mode === "active" ? date : (existing?.startedAt || ""),
      caughtAt: mode === "caught" ? date : "",
      nickname: elements.huntNickname.value.trim().slice(0, 40),
      notes: elements.huntNotes.value.trim().slice(0, 600),
      updatedAt: Date.now()
    };
    if (!existing && mode === "caught") setQuantity(entryKey, quantityFor(entryKey) + 1, { sparkle: true });
    else saveState();
    closeDialog(elements.huntEditorDialog);
    renderHunts();
    showToast(t(mode === "caught" ? "captureSaved" : "huntSaved"));
  });
  elements.openResetButton.addEventListener("click", () => {
    closeDialog(elements.settingsDialog);
    showDialog(elements.resetDialog);
  });
  elements.confirmResetButton.addEventListener("click", () => {
    state = defaultState();
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
    saveState();
    applyLanguage();
    showToast(t("resetDone"));
  });
  elements.confirmRemoveButton.addEventListener("click", () => {
    if (pendingRemovalKey) setQuantity(pendingRemovalKey, 0);
    pendingRemovalKey = null;
  });
  elements.removeDialog.addEventListener("close", () => {
    if (elements.removeDialog.returnValue !== "confirm") pendingRemovalKey = null;
  });
  elements.exportButton.addEventListener("click", exportCollection);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", () => {
    const [file] = elements.importInput.files;
    if (file) importCollection(file);
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.matches("input, textarea, select")) return;
    event.preventDefault();
    elements.searchInput.focus();
  });

  document.addEventListener("click", event => {
    const dialog = event.target.closest("dialog");
    if (!dialog || event.target !== dialog) return;
    const rectangle = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rectangle.left
      && event.clientX <= rectangle.right
      && event.clientY >= rectangle.top
      && event.clientY <= rectangle.bottom;
    if (!inside) closeDialog(dialog);
  });

  populateLanguageOptions();
  applyLanguage();
  setCloudStatus();
  preloadShinySheets();
  setInterval(rotateVisibleVariants, ROTATION_DELAY);

  window.SHINYDEX_APP = Object.freeze({
    getState: publicState,
    applySyncedState,
    setCloudStatus,
    showToast,
    t,
    getLanguage: language,
    dataGeneratedAt: DATA.generatedAt
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Le site reste entièrement fonctionnel sans installation PWA.
      });
    });
  }
})();
