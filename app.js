(() => {
  "use strict";

  const DATA = window.SHINYDEX_DATA;
  if (!DATA?.entries?.length) {
    document.body.innerHTML = "<p style='padding:2rem'>La base locale du Shinydex est introuvable.</p>";
    return;
  }

  const STORAGE_KEY = "pokemonShinydex:v1";
  const LEGACY_KEYS = ["pokemonShinydex", "shinydex"];
  const MAX_QUANTITY = 999;
  const REGION_NAMES = {
    1: "Kanto",
    2: "Johto",
    3: "Hoenn",
    4: "Sinnoh",
    5: "Unys",
    6: "Kalos",
    7: "Alola",
    8: "Galar & Hisui",
    9: "Paldea"
  };

  const elements = Object.fromEntries([
    "searchInput", "generationFilter", "typeFilter", "statusFilter", "sortSelect",
    "pokemonGrid", "pokemonCardTemplate", "ownedCount", "appearanceTotal", "speciesCount",
    "speciesTotal", "copyCount", "progressPercent", "progressBar", "progressMessage",
    "resultCount", "activeFilter", "activeFilterText", "clearFiltersButton", "emptyState",
    "emptyResetButton", "densityButton", "settingsButton", "settingsDialog", "animationSetting",
    "confirmSetting", "openResetButton", "resetDialog", "confirmResetButton", "removeDialog",
    "removeDialogText", "confirmRemoveButton", "exportButton", "importButton", "importInput",
    "toast", "dataVersion", "accountButton", "accountLabel", "cloudStatusLabel", "cloudDot",
    "authDialog", "closeAuthButton", "signedOutPanel", "signedInPanel", "accountEmail",
    "cloudStatusText", "cloudStatusDetail", "dialogCloudDot"
  ].map(id => [id, document.getElementById(id)]));

  const validKeys = new Set(DATA.entries.map(entry => entry.key));
  const entryByKey = new Map(DATA.entries.map(entry => [entry.key, entry]));
  const cardNodes = new Map();
  let state = loadState();
  let pendingRemovalKey = null;
  let toastTimer;
  let renderFrame;

  function defaultState() {
    return {
      schemaVersion: 1,
      collection: {},
      preferences: {
        compact: false,
        animations: true,
        confirmRemove: false
      }
    };
  }

  function sanitizeCollection(collection) {
    const sanitized = {};
    if (!collection || typeof collection !== "object") return sanitized;
    for (const [key, rawQuantity] of Object.entries(collection)) {
      const quantity = Math.min(MAX_QUANTITY, Math.max(0, Number.parseInt(rawQuantity, 10) || 0));
      if (validKeys.has(key) && quantity > 0) sanitized[key] = quantity;
    }
    return sanitized;
  }

  function normalizeState(raw) {
    const clean = defaultState();
    if (!raw || typeof raw !== "object") return clean;
    clean.collection = sanitizeCollection(raw.collection || raw.caught || raw);
    clean.preferences.compact = Boolean(raw.preferences?.compact);
    clean.preferences.animations = raw.preferences?.animations !== false;
    clean.preferences.confirmRemove = Boolean(raw.preferences?.confirmRemove);
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
      showToast("La sauvegarde locale est saturée ou indisponible.");
    }
    if (notifyCloud) {
      document.dispatchEvent(new CustomEvent("shinydex:local-change"));
    }
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("fr")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9♀♂]+/g, " ")
      .trim();
  }

  function quantityFor(key) {
    return Number(state.collection[key]) || 0;
  }

  function isOwned(key) {
    return quantityFor(key) > 0;
  }

  function initializeFilters() {
    for (const generation of DATA.generations) {
      const option = document.createElement("option");
      option.value = String(generation);
      option.textContent = `Génération ${generation} · ${REGION_NAMES[generation] || "Nouvelle région"}`;
      elements.generationFilter.append(option);
    }
    for (const type of DATA.types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      elements.typeFilter.append(option);
    }
  }

  function spriteStyle(sprite, entry, shiny) {
    const column = entry.slot % DATA.atlasColumns;
    const row = Math.floor(entry.slot / DATA.atlasColumns);
    const sheets = shiny ? DATA.shinySheets : DATA.normalSheets;
    sprite.style.backgroundImage = `url("${sheets[entry.sheet]}")`;
    sprite.style.backgroundPosition = `${-column * DATA.cellSize}px ${-row * DATA.cellSize}px`;
    sprite.style.backgroundSize = `${DATA.atlasSize}px ${DATA.atlasSize}px`;
    sprite.setAttribute(
      "aria-label",
      `${entry.name}${entry.label ? `, ${entry.label}` : ""}${shiny ? " chromatique" : ""}`
    );
  }

  function createCard(entry) {
    const fragment = elements.pokemonCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".pokemon-card");
    const toggle = fragment.querySelector(".pokemon-card__toggle");
    const sprite = fragment.querySelector(".pokemon-sprite");
    const form = fragment.querySelector(".pokemon-card__form");
    const typeContainer = fragment.querySelector(".pokemon-card__types");
    const quantityInput = fragment.querySelector(".quantity__input");
    const quantity = quantityFor(entry.key);
    const owned = quantity > 0;

    card.dataset.key = entry.key;
    card.classList.toggle("is-owned", owned);
    toggle.setAttribute("aria-pressed", String(owned));
    toggle.setAttribute(
      "aria-label",
      `${owned ? "Retirer" : "Ajouter"} ${entry.name}${entry.label ? `, ${entry.label}` : ""} ${owned ? "de" : "à"} la collection`
    );
    fragment.querySelector(".pokemon-card__number").textContent = `#${String(entry.speciesId).padStart(4, "0")}`;
    fragment.querySelector(".pokemon-card__name").textContent = entry.name;
    form.textContent = entry.label;
    form.hidden = !entry.label;
    fragment.querySelector(".pokemon-card__hint").textContent = owned ? "Shiny possédé" : "Cliquer pour marquer";
    quantityInput.value = String(quantity || 1);
    quantityInput.setAttribute("aria-label", `Quantité de ${entry.name}${entry.label ? ` ${entry.label}` : ""}`);
    spriteStyle(sprite, entry, owned);

    for (const type of entry.types) {
      const pill = document.createElement("span");
      pill.className = "type-pill";
      pill.textContent = type;
      typeContainer.append(pill);
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

  function filteredEntries() {
    const filters = currentFilters();
    const numericSearch = filters.search.replace(/\D/g, "");
    const isNumberSearch = Boolean(filters.search) && /^#?\s*\d+$/.test(elements.searchInput.value.trim());
    const list = DATA.entries.filter(entry => {
      if (filters.search) {
        const haystack = normalize(`${entry.name} ${entry.label} ${entry.slug}`);
        const matchesSearch = isNumberSearch
          ? String(entry.speciesId) === String(Number(numericSearch))
          : haystack.includes(filters.search);
        if (!matchesSearch) return false;
      }
      if (filters.generation !== "all" && entry.generation !== Number(filters.generation)) return false;
      if (filters.type !== "all" && !entry.types.includes(filters.type)) return false;
      if (filters.status === "owned" && !isOwned(entry.key)) return false;
      if (filters.status === "missing" && isOwned(entry.key)) return false;
      if (filters.status === "variants" && !entry.variant) return false;
      return true;
    });

    const byNumber = (a, b) =>
      a.speciesId - b.speciesId
      || a.sheet - b.sheet
      || a.slot - b.slot;
    if (filters.sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "fr") || byNumber(a, b));
    } else if (filters.sort === "owned") {
      list.sort((a, b) => Number(isOwned(b.key)) - Number(isOwned(a.key)) || byNumber(a, b));
    } else if (filters.sort === "missing") {
      list.sort((a, b) => Number(isOwned(a.key)) - Number(isOwned(b.key)) || byNumber(a, b));
    } else {
      list.sort(byNumber);
    }
    return list;
  }

  function render() {
    const entries = filteredEntries();
    const fragment = document.createDocumentFragment();
    cardNodes.clear();
    for (const entry of entries) {
      const card = createCard(entry);
      cardNodes.set(entry.key, card);
      fragment.append(card);
    }
    elements.pokemonGrid.replaceChildren(fragment);
    elements.emptyState.hidden = entries.length > 0;
    elements.pokemonGrid.hidden = entries.length === 0;
    elements.resultCount.textContent = `${entries.length.toLocaleString("fr-FR")} apparence${entries.length > 1 ? "s" : ""}`;
    updateActiveFilter();
  }

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  }

  function updateActiveFilter() {
    const filters = currentFilters();
    const labels = [];
    if (filters.search) labels.push(`recherche « ${elements.searchInput.value.trim()} »`);
    if (filters.generation !== "all") labels.push(`génération ${filters.generation}`);
    if (filters.type !== "all") labels.push(`type ${filters.type}`);
    if (filters.status !== "all") {
      labels.push({
        owned: "collection uniquement",
        missing: "manquants uniquement",
        variants: "formes multiples"
      }[filters.status]);
    }
    elements.activeFilter.hidden = labels.length === 0;
    elements.activeFilterText.textContent = labels.length ? `Filtres actifs : ${labels.join(" · ")}` : "";
  }

  function updateStats() {
    const ownedEntries = DATA.entries.filter(entry => isOwned(entry.key));
    const ownedSpecies = new Set(ownedEntries.map(entry => entry.speciesId)).size;
    const totalCopies = Object.values(state.collection).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const percentage = DATA.appearanceCount ? (ownedEntries.length / DATA.appearanceCount) * 100 : 0;
    const rounded = percentage < 1 && percentage > 0 ? percentage.toFixed(1) : Math.round(percentage);

    elements.ownedCount.textContent = ownedEntries.length.toLocaleString("fr-FR");
    elements.appearanceTotal.textContent = DATA.appearanceCount.toLocaleString("fr-FR");
    elements.speciesCount.textContent = ownedSpecies.toLocaleString("fr-FR");
    elements.speciesTotal.textContent = DATA.speciesCount.toLocaleString("fr-FR");
    elements.copyCount.textContent = totalCopies.toLocaleString("fr-FR");
    elements.progressPercent.textContent = `${rounded} %`;
    elements.progressBar.style.width = `${Math.min(100, percentage)}%`;
    elements.progressBar.parentElement.setAttribute("aria-valuenow", String(Math.round(percentage)));

    if (percentage === 0) {
      elements.progressMessage.textContent = "Votre aventure chromatique commence ici.";
    } else if (percentage < 25) {
      elements.progressMessage.textContent = "La collection prend forme, shiny après shiny.";
    } else if (percentage < 50) {
      elements.progressMessage.textContent = "Un quart du chemin est déjà derrière vous.";
    } else if (percentage < 75) {
      elements.progressMessage.textContent = "Plus de la moitié du Shinydex se met à briller.";
    } else if (percentage < 100) {
      elements.progressMessage.textContent = "La collection complète est à portée de main.";
    } else {
      elements.progressMessage.textContent = "Shinydex complet — une collection exceptionnelle !";
    }
  }

  function updateVisibleCard(key) {
    const card = cardNodes.get(key);
    const entry = entryByKey.get(key);
    if (!card || !entry) return;
    const owned = isOwned(key);
    const quantity = quantityFor(key);
    const toggle = card.querySelector(".pokemon-card__toggle");
    const input = card.querySelector(".quantity__input");
    card.classList.toggle("is-owned", owned);
    toggle.setAttribute("aria-pressed", String(owned));
    toggle.setAttribute(
      "aria-label",
      `${owned ? "Retirer" : "Ajouter"} ${entry.name}${entry.label ? `, ${entry.label}` : ""} ${owned ? "de" : "à"} la collection`
    );
    card.querySelector(".pokemon-card__hint").textContent = owned ? "Shiny possédé" : "Cliquer pour marquer";
    input.value = String(quantity || 1);
    spriteStyle(card.querySelector(".pokemon-sprite"), entry, owned);
  }

  function setQuantity(key, rawQuantity, { sparkle = false } = {}) {
    const previous = quantityFor(key);
    const quantity = Math.min(MAX_QUANTITY, Math.max(0, Number.parseInt(rawQuantity, 10) || 0));
    if (quantity > 0) state.collection[key] = quantity;
    else delete state.collection[key];
    saveState();
    updateStats();

    const filters = currentFilters();
    if (
      filters.status === "owned"
      || filters.status === "missing"
      || filters.sort === "owned"
      || filters.sort === "missing"
    ) {
      render();
    } else {
      updateVisibleCard(key);
    }

    if (sparkle && previous === 0 && quantity > 0 && state.preferences.animations) {
      const card = cardNodes.get(key);
      if (card) createSparkles(card);
    }
  }

  function requestRemoval(key) {
    const entry = entryByKey.get(key);
    if (!entry) return;
    if (!state.preferences.confirmRemove) {
      setQuantity(key, 0);
      return;
    }
    pendingRemovalKey = key;
    elements.removeDialogText.textContent =
      `${entry.name}${entry.label ? ` — ${entry.label}` : ""} sera retiré de votre collection.`;
    elements.removeDialog.showModal();
  }

  function toggleEntry(key) {
    if (isOwned(key)) requestRemoval(key);
    else setQuantity(key, 1, { sparkle: true });
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
    elements.densityButton.setAttribute("aria-pressed", String(state.preferences.compact));
    elements.pokemonGrid.classList.toggle("is-compact", state.preferences.compact);
    elements.densityButton.querySelector("span").textContent = state.preferences.compact ? "Confort" : "Compact";
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
  }

  function publicState() {
    return {
      schemaVersion: 1,
      collection: { ...state.collection },
      preferences: { ...state.preferences }
    };
  }

  function applySyncedState(nextState, notification = "") {
    state = normalizeState(nextState);
    saveState(false);
    syncPreferences();
    updateStats();
    render();
    if (notification) showToast(notification);
  }

  function setCloudStatus({ user = null, status = "local", label = "", detail = "" } = {}) {
    const connected = Boolean(user);
    const stateClass = {
      syncing: "is-syncing",
      synced: "is-synced",
      error: "is-error",
      offline: "is-error"
    }[status] || "";
    const shortLabel = {
      local: "Sauvegarde locale",
      syncing: "Synchronisation…",
      synced: "Sauvegarde cloud",
      error: "Erreur Firebase",
      offline: "Mode hors ligne"
    }[status] || "Sauvegarde locale";
    const longLabel = label || {
      local: "Non connecté",
      syncing: "Synchronisation en cours",
      synced: "Collection synchronisée",
      error: "Synchronisation impossible",
      offline: "En attente de connexion"
    }[status] || "Sauvegarde locale";

    for (const dot of [elements.cloudDot, elements.dialogCloudDot]) {
      dot?.classList.remove("is-syncing", "is-synced", "is-error");
      if (stateClass) dot?.classList.add(stateClass);
    }
    elements.cloudStatusLabel.textContent = shortLabel;
    elements.accountLabel.textContent = connected ? user.email : "Connexion";
    elements.signedOutPanel.hidden = connected;
    elements.signedInPanel.hidden = !connected;
    elements.accountEmail.textContent = user?.email || "";
    elements.cloudStatusText.textContent = longLabel;
    elements.cloudStatusDetail.textContent = detail || (
      connected
        ? "Vos modifications sont conservées localement et dans Firebase."
        : "Connectez-vous pour activer la sauvegarde cloud."
    );
  }

  function exportCollection() {
    const payload = {
      format: "pokemon-shinydex",
      schemaVersion: 1,
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
    showToast("Sauvegarde exportée.");
  }

  async function importCollection(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format && payload.format !== "pokemon-shinydex") {
        throw new Error("Ce fichier ne provient pas du Shinydex.");
      }
      const imported = normalizeState(payload);
      if (Object.keys(imported.collection).length === 0 && Object.keys(payload.collection || {}).length > 0) {
        throw new Error("Aucune fiche compatible avec cette version.");
      }
      state = imported;
      saveState();
      syncPreferences();
      updateStats();
      render();
      showToast("Collection importée avec succès.");
    } catch (error) {
      showToast(error.message || "Le fichier de sauvegarde est invalide.");
    } finally {
      elements.importInput.value = "";
    }
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

  elements.pokemonGrid.addEventListener("click", event => {
    const card = event.target.closest(".pokemon-card");
    if (!card) return;
    const key = card.dataset.key;
    if (event.target.closest(".pokemon-card__toggle")) {
      toggleEntry(key);
    } else if (event.target.closest(".quantity__plus")) {
      setQuantity(key, quantityFor(key) + 1);
    } else if (event.target.closest(".quantity__minus")) {
      const quantity = quantityFor(key);
      if (quantity <= 1) requestRemoval(key);
      else setQuantity(key, quantity - 1);
    }
  });

  elements.pokemonGrid.addEventListener("change", event => {
    if (!event.target.matches(".quantity__input")) return;
    const key = event.target.closest(".pokemon-card")?.dataset.key;
    if (key) setQuantity(key, event.target.value || 1);
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

  elements.clearFiltersButton.addEventListener("click", resetFilters);
  elements.emptyResetButton.addEventListener("click", resetFilters);
  elements.densityButton.addEventListener("click", () => {
    state.preferences.compact = !state.preferences.compact;
    saveState();
    syncPreferences();
  });
  elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
  elements.accountButton.addEventListener("click", () => elements.authDialog.showModal());
  elements.closeAuthButton.addEventListener("click", () => elements.authDialog.close());
  elements.animationSetting.addEventListener("change", () => {
    state.preferences.animations = elements.animationSetting.checked;
    saveState();
  });
  elements.confirmSetting.addEventListener("change", () => {
    state.preferences.confirmRemove = elements.confirmSetting.checked;
    saveState();
  });
  elements.openResetButton.addEventListener("click", () => {
    elements.settingsDialog.close();
    elements.resetDialog.showModal();
  });
  elements.confirmResetButton.addEventListener("click", () => {
    state = defaultState();
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
    saveState();
    syncPreferences();
    updateStats();
    render();
    showToast("Le Shinydex a été réinitialisé.");
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
    if (!inside) dialog.close();
  });

  initializeFilters();
  syncPreferences();
  setCloudStatus();
  updateStats();
  render();
  preloadShinySheets();

  window.SHINYDEX_APP = Object.freeze({
    getState: publicState,
    applySyncedState,
    setCloudStatus,
    showToast,
    dataGeneratedAt: DATA.generatedAt
  });

  const generatedDate = new Date(DATA.generatedAt);
  elements.dataVersion.textContent = Number.isNaN(generatedDate.getTime())
    ? `${DATA.speciesCount} espèces · ${DATA.appearanceCount} apparences`
    : `Base générée le ${generatedDate.toLocaleDateString("fr-FR")} · ${DATA.speciesCount} espèces · ${DATA.appearanceCount} apparences`;

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Le site reste entièrement fonctionnel sans installation PWA.
      });
    });
  }
})();
