/* Référentiel de légalité shiny — vérifié le 29 juillet 2026. */
window.SHINYDEX_AVAILABILITY = Object.freeze({
  schemaVersion: 1,
  checkedAt: "2026-07-29T00:00:00Z",
  sourceRevision: "4558181",
  sourceUrl: "https://bulbapedia.bulbagarden.net/wiki/List_of_unobtainable_Shiny_Pok%C3%A9mon",
  unavailableSpeciesIds: Object.freeze([
    494, 720, 789, 790, 801, 802,
    891, 892, 893, 896, 897, 898,
    1009, 1010, 1014, 1015, 1016, 1017,
    1020, 1021, 1022, 1023, 1024, 1025
  ]),
  unavailableForms: Object.freeze([
    Object.freeze({ speciesId: 172, formIds: [10065], names: ["spiky-eared"] }),
    Object.freeze({
      speciesId: 25,
      formIds: [10182, 10183, 10184, 10185, 10186, 10187, 10196, 10197, 10198, 10199, 10200, 10201, 10319],
      names: ["cosplay pikachu", "pikachu rock star", "pikachu belle", "pikachu pop star", "pikachu ph.d.", "pikachu libre", "original cap", "hoenn cap", "sinnoh cap", "unova cap", "kalos cap", "alola cap", "world cap", "partner pikachu"]
    }),
    Object.freeze({ speciesId: 133, formIds: [], names: ["partner eevee"] }),
    Object.freeze({ speciesId: 658, formIds: [10219], names: ["ash-greninja", "battle bond"] }),
    Object.freeze({ speciesId: 666, formIds: [10162], names: ["poké ball pattern", "poke ball pattern"] }),
    Object.freeze({ speciesId: 670, formIds: [10163, 10521], names: ["eternal flower", "mega floette"] }),
    Object.freeze({ speciesId: 809, formIds: [10377], names: ["gigantamax form"] }),
    Object.freeze({ speciesId: 890, formIds: [10359], names: ["eternamax"] }),
    Object.freeze({ speciesId: 901, formIds: [10441], names: ["bloodmoon"] })
  ]),
  legalExceptions: Object.freeze([
    Object.freeze({
      speciesId: 25,
      formIds: [10267],
      note: "Partner Cap Pikachu can legally be Shiny because of a programming oversight, although its colors are unchanged."
    }),
    Object.freeze({
      speciesId: 721,
      note: "Shiny Volcanion has been legally obtainable from Pokémon HOME since April 27, 2026."
    })
  ])
});

/*
 * Correctifs appliqués avant app.js : Lépidonille et Pérégrain n'ont qu'une
 * forme. Les anciennes clés de motifs sont redirigées vers la forme conservée,
 * ce qui migre automatiquement les sauvegardes existantes sans les additionner.
 */
(() => {
  const data = window.SHINYDEX_DATA;
  if (data?.entries?.length) {
    const collapsedSpecies = new Set([664, 665]);
    const aliases = { ...(data.keyAliases || {}) };
    const entries = [];

    for (const speciesId of collapsedSpecies) {
      const speciesEntries = data.entries.filter(entry => entry.speciesId === speciesId);
      const representatives = new Map();
      for (const entry of speciesEntries) {
        const gender = entry.gender || "genderless";
        const current = representatives.get(gender);
        const score = candidate => {
          const formKey = String(candidate.formKey || "");
          const slug = String(candidate.slug || "");
          return [
            Number(formKey !== slug),
            candidate.formOrder ?? Number.MAX_SAFE_INTEGER,
            candidate.formId ?? Number.MAX_SAFE_INTEGER
          ];
        };
        const entryScore = score(entry);
        const currentScore = current ? score(current) : null;
        const isBetter = !currentScore
          || entryScore[0] < currentScore[0]
          || (entryScore[0] === currentScore[0] && entryScore[1] < currentScore[1])
          || (entryScore[0] === currentScore[0] && entryScore[1] === currentScore[1] && entryScore[2] < currentScore[2]);
        if (isBetter) representatives.set(gender, entry);
      }

      const canonicalByGender = new Map();
      for (const [gender, representative] of representatives) {
        const canonical = {
          ...representative,
          formKey: "default",
          formOrder: 0,
          label: "",
          formNames: Object.freeze(Object.fromEntries((data.languages || ["fr", "en", "es", "de", "it", "ja"]).map(code => [code, ""])))
        };
        canonicalByGender.set(gender, canonical);
        entries.push(canonical);
      }

      for (const entry of speciesEntries) {
        const canonical = canonicalByGender.get(entry.gender || "genderless")
          || canonicalByGender.values().next().value;
        if (canonical && entry.key !== canonical.key) aliases[entry.key] = canonical.key;
      }
    }

    for (const entry of data.entries) {
      if (!collapsedSpecies.has(entry.speciesId)) entries.push(entry);
    }

    entries.sort((a, b) =>
      a.speciesId - b.speciesId
      || (a.formOrder ?? Number.MAX_SAFE_INTEGER) - (b.formOrder ?? Number.MAX_SAFE_INTEGER)
      || String(a.formKey || a.formId).localeCompare(String(b.formKey || b.formId), "en")
      || ({ male: 0, female: 1, genderless: 2 }[a.gender] ?? 9)
    );

    window.SHINYDEX_DATA = {
      ...data,
      entries,
      keyAliases: aliases,
      appearanceCount: entries.length
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector('link[href="shinydex-enhancements.css"]')) {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = "shinydex-enhancements.css";
      document.head.append(style);
    }
    if (!document.querySelector('script[src="shinydex-enhancements.js"]')) {
      const script = document.createElement("script");
      script.src = "shinydex-enhancements.js";
      document.body.append(script);
    }
  }, { once: true });
})();
