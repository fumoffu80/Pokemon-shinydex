(() => {
  "use strict";

  const DATA = window.SHINYDEX_DATA;
  const I18N = window.SHINYDEX_I18N;
  const AVAILABILITY = window.SHINYDEX_AVAILABILITY || {};
  const DISTRIBUTIONS = window.SHINYDEX_DISTRIBUTIONS || { items: [] };
  const DISTRIBUTION_SOURCE_LOCALES = window.SHINYDEX_DISTRIBUTION_SOURCE_LOCALES?.sources || {};
  const GENDER_DIFFERENCES = window.SHINYDEX_GENDER_DIFFERENCES || {};
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
  const EVOLUTION_MATCH_FORM_EDGES = new Set([
    "412:413", // Cheniti → Cheniselle (cape conservée)
    "422:423", // Sancoki → Tritosor (mer conservée)
    "585:586", // Vivaldaim → Haydaim (saison conservée)
    "669:670", "670:671", // Flabébé → Floette → Florges (couleur conservée)
    "710:711", // Pitrouille → Banshitrouye (taille conservée)
    "854:855" // Théffroi → Polthégeist (authenticité conservée)
  ]);
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

  const elements = Object.fromEntries([
    "metaDescription", "languageFlag", "languageSelect", "searchInput", "generationFilter", "typeFilter",
    "statusFilter", "sortSelect", "pokemonGrid", "pokemonCardTemplate", "variantCardTemplate",
    "ownedCount", "appearanceTotal", "speciesCount", "speciesTotal", "copyCount",
    "progressPercent", "progressBar", "progressMessage", "resultCount", "activeFilter",
    "activeFilterText", "clearFiltersButton", "emptyState", "emptyResetButton",
    "cardSizeButton", "cardSizeValue",
    "settingsButton", "settingsDialog", "animationSetting", "confirmSetting", "openResetButton",
    "resetDialog", "confirmResetButton", "removeDialog", "removeDialogText",
    "confirmRemoveButton", "variantDialog", "variantDialogTitle", "variantGrid",
    "genderDifferenceNote", "genderDifferenceTitle", "genderDifferenceText",
    "closeVariantButton", "exportButton", "importButton", "importInput", "toast", "dataVersion",
    "accountButton", "accountLabel", "cloudStatusLabel", "cloudDot", "authDialog",
    "closeAuthButton", "signedOutPanel", "signedInPanel", "accountEmail", "cloudStatusText",
    "cloudStatusDetail", "dialogCloudDot", "authPassword", "togglePasswordButton",
    "distributionGrid", "distributionEmpty", "distributionUpdatedAt", "distributionCount", "distributionTicker",
    "evolutionSuggestions", "evolutionEmpty", "evolutionCount"
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
  const evolutionAdjacency = new Map();
  for (const edge of DATA.evolutions || []) {
    const targets = evolutionAdjacency.get(Number(edge.from)) || [];
    targets.push(Number(edge.to));
    evolutionAdjacency.set(Number(edge.from), targets);
  }
  const evolutionPathsCache = new Map();

  const cardNodes = new Map();
  const activeVariantIndex = new Map();
  const visibleSpecies = new Set();
  let state = loadState();
  let pendingRemovalKey = null;
  let activeDialogSpecies = null;
  let variantExitTimer;
  let toastTimer;
  let renderFrame;
  let lastCloudDescriptor = { status: "local" };

  function preferredLanguage() {
    return "fr";
  }

  function defaultState() {
    return {
      schemaVersion: 2,
      collection: {},
      preferences: {
        language: preferredLanguage(),
        animations: true,
        confirmRemove: false,
        cardSize: "normal"
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
    const language = raw.preferences?.language;
    clean.preferences.language = DATA.languages?.includes(language) ? language : clean.preferences.language;
    clean.preferences.animations = raw.preferences?.animations !== false;
    clean.preferences.confirmRemove = Boolean(raw.preferences?.confirmRemove);
    clean.preferences.cardSize = CARD_SIZE_LEVELS.some(level => level.id === raw.preferences?.cardSize)
      ? raw.preferences.cardSize
      : clean.preferences.cardSize;
    return clean;
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

  function spriteStyle(sprite, entry, shiny) {
    const column = entry.slot % DATA.atlasColumns;
    const row = Math.floor(entry.slot / DATA.atlasColumns);
    const sheets = shiny ? DATA.shinySheets : DATA.normalSheets;
    const displaySize = sprite.closest(".pokemon-card")
      ? currentCardSize().spriteSize
      : DATA.cellSize;
    const scale = displaySize / DATA.cellSize;
    sprite.style.backgroundImage = `url("${sheets[entry.sheet]}")`;
    sprite.style.backgroundPosition = `${-column * DATA.cellSize * scale}px ${-row * DATA.cellSize * scale}px`;
    sprite.style.backgroundSize = `${DATA.atlasSize * scale}px ${DATA.atlasSize * scale}px`;
    sprite.setAttribute(
      "aria-label",
      `${localizedName(entry)}, ${variantLabel(entry, { alwaysGender: true }) || t("defaultForm")}${shiny ? " ✦" : ""}`
    );
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

  placeholderBadge.hidden = !entry.spritePlaceholder;
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
  if (filters.sort === "name") {
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
    } else if (EVOLUTION_MATCH_FORM_EDGES.has(directEdge) && sourceForm) {
      const ignored = new Set(["form", "forme", "cloak", "core"]);
      const sourceTokens = sourceForm.split(" ").filter(token => token.length > 2 && !ignored.has(token));
      const matching = candidates.filter(entry => {
        const targetForm = evolutionFormName(entry);
        return sourceTokens.some(token => targetForm.includes(token));
      });
      if (matching.length) candidates = matching;
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

  function evolutionRecommendations() {
    const bestByTarget = new Map();
    const sources = DATA.entries.filter(entry =>
      !entry.exceptional
      && isLegallyObtainable(entry)
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
          const existing = bestByTarget.get(target.key);
          if (
            !existing
            || recommendation.steps < existing.steps
            || (
              recommendation.steps === existing.steps
              && recommendation.sourceQuantity > existing.sourceQuantity
            )
          ) {
            bestByTarget.set(target.key, recommendation);
          }
        }
      }
    }

    return [...bestByTarget.values()].sort((a, b) =>
      a.source.speciesId - b.source.speciesId
      || a.target.speciesId - b.target.speciesId
      || (a.target.formOrder ?? 0) - (b.target.formOrder ?? 0)
      || (GENDER_ORDER[a.target.gender] ?? 9) - (GENDER_ORDER[b.target.gender] ?? 9)
    );
  }

  function renderEvolutionSuggestions() {
    if (!elements.evolutionSuggestions) return;
    const recommendations = evolutionRecommendations();
    elements.evolutionCount.textContent = t(
      recommendations.length === 1 ? "evolutionCountOne" : "evolutionCount",
      { count: formatNumber(recommendations.length) }
    );
    elements.evolutionEmpty.hidden = recommendations.length > 0;
    const fragment = document.createDocumentFragment();

    for (const recommendation of recommendations) {
      const card = document.createElement("article");
      card.className = "evolution-card";

      const source = document.createElement("div");
      source.className = "evolution-card__pokemon";
      const sourceSprite = document.createElement("span");
      sourceSprite.className = "evolution-card__sprite";
      spriteStyle(sourceSprite, recommendation.source, true);
      const sourceName = document.createElement("strong");
      sourceName.textContent = localizedName(recommendation.source);
      const sourceVariant = document.createElement("small");
      sourceVariant.textContent = variantLabel(recommendation.source, { alwaysGender: true }) || t("defaultForm");
      const sourceCount = document.createElement("span");
      sourceCount.className = "evolution-card__count";
      sourceCount.textContent = t("evolutionCopies", {
        count: formatNumber(recommendation.sourceQuantity),
        remaining: formatNumber(recommendation.sourceQuantity - 1)
      });
      source.append(sourceSprite, sourceName, sourceVariant, sourceCount);

      const arrow = document.createElement("span");
      arrow.className = "evolution-card__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";

      const target = document.createElement("div");
      target.className = "evolution-card__pokemon evolution-card__pokemon--target";
      const targetSprite = document.createElement("span");
      targetSprite.className = "evolution-card__sprite";
      spriteStyle(targetSprite, recommendation.target, true);
      const targetName = document.createElement("strong");
      targetName.textContent = localizedName(recommendation.target);
      const targetVariant = document.createElement("small");
      targetVariant.textContent = variantLabel(recommendation.target, { alwaysGender: true }) || t("defaultForm");
      const targetStatus = document.createElement("span");
      targetStatus.className = "evolution-card__target-status";
      targetStatus.textContent = t("evolutionMissingTarget");
      target.append(targetSprite, targetName, targetVariant, targetStatus);

      const path = document.createElement("p");
      path.className = "evolution-card__path";
      path.textContent = t("evolutionPath", {
        path: recommendation.path.map(speciesId => {
          const group = groupsBySpecies.get(speciesId);
          return group ? localizedName(group.entries[0]) : `#${speciesId}`;
        }).join(" → ")
      });

      const body = document.createElement("div");
      body.className = "evolution-card__body";
      body.append(source, arrow, target);
      card.append(body, path);
      fragment.append(card);
    }

    elements.evolutionSuggestions.replaceChildren(fragment);
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
    render();
  }

  function syncPreferences() {
    elements.animationSetting.checked = state.preferences.animations;
    elements.confirmSetting.checked = state.preferences.confirmRemove;
    elements.languageSelect.value = language();
    applyCardSize();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
  }

  function publicState() {
    return {
      schemaVersion: 2,
      collection: { ...state.collection },
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
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      dataGeneratedAt: DATA.generatedAt,
      collection: state.collection,
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
  const fragment = document.createDocumentFragment();
  for (const entry of group.entries) {
    const item = elements.variantCardTemplate.content.cloneNode(true);
    const card = item.querySelector(".variant-option");
    const toggle = item.querySelector(".variant-option__toggle");
    const unavailable = !isLegallyObtainable(entry);
    const owned = !unavailable && isOwned(entry.key);
    const exception = !unavailable && isException(entry.key);
    card.dataset.key = entry.key;
    card.classList.toggle("is-owned", owned);
    card.classList.toggle("is-exception", exception);
    card.classList.toggle("is-unobtainable", unavailable);
    card.classList.toggle("is-exceptional-form", Boolean(entry.exceptional));
    card.classList.toggle("is-form-complete", isFormShinyComplete(group, entry));
    card.classList.toggle("has-placeholder-sprite", Boolean(entry.spritePlaceholder));
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
    spriteStyle(sprite, entry, owned);
    card.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
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
    item.querySelector(".variant-option__status").textContent = entry.spritePlaceholder
      ? `${t("placeholderSprite")} · ${variantStatus}`
      : variantStatus;
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
    updateDataVersion();
    if (activeDialogSpecies && elements.variantDialog.hasAttribute("open")) {
      const group = groupsBySpecies.get(activeDialogSpecies);
      if (group) renderVariantDialog(group);
    }
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
  function preloadShinySheets() {
    const queue = [...DATA.shinySheets];
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
    if (event.target.closest(".variant-badge")) {
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
    if (event.target.closest(".variant-option__toggle")) {
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
  elements.cardSizeButton.addEventListener("click", cycleCardSize);
  elements.settingsButton.addEventListener("click", () => showDialog(elements.settingsDialog));
  elements.accountButton.addEventListener("click", () => showDialog(elements.authDialog));
  elements.closeAuthButton.addEventListener("click", () => closeDialog(elements.authDialog));
  elements.closeVariantButton.addEventListener("click", () => closeDialog(elements.variantDialog));
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
