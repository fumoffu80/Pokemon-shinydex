/* Distributions mondiales en cours ou annoncées — vérifiées le 29 juillet 2026. */
window.SHINYDEX_DISTRIBUTIONS = Object.freeze({
  schemaVersion: 1,
  updatedAt: "2026-07-29T00:00:00Z",
  monitoring: Object.freeze({
    cadence: "daily",
    workflow: ".github/workflows/monitor-live-data.yml"
  }),
  items: Object.freeze([
    Object.freeze({
      id: "home-shiny-volcanion-2026",
      title: Object.freeze({
        fr: "Volcanion shiny",
        en: "Shiny Volcanion",
        es: "Volcanion variocolor",
        de: "Schillerndes Volcanion",
        it: "Volcanion cromatico",
        ja: "色違いのボルケニオン"
      }),
      shiny: true,
      start: "2026-04-27",
      end: null,
      regions: ["worldwide"],
      games: ["Pokémon HOME"],
      method: Object.freeze({
        fr: "Cadeau Mystère dans l’application mobile Pokémon HOME",
        en: "Mystery Gift in the Pokémon HOME mobile app"
      }),
      details: Object.freeze({
        fr: "Complétez dans Pokémon HOME les Pokédex d’Illumis, de l’Hyperespace et des Méga-Évolutions de Pokémon Légendes : Z-A, puis confirmez leur complétion.",
        en: "Complete the Lumiose, Hyperspace, and Mega Evolution Pokédexes from Pokémon Legends: Z-A in Pokémon HOME, then confirm their completion."
      }),
      sourceUrl: "https://www.pokemon.com/uk/news/receive-shiny-volcanion-when-you-complete-your-pokemon-legends-z-a-pokedexes"
    }),
    Object.freeze({
      id: "home-alpha-starters-za-2026",
      title: Object.freeze({
        fr: "Germignon, Gruikui et Kaiminus alpha",
        en: "Alpha Chikorita, Tepig, and Totodile",
        es: "Chikorita, Tepig y Totodile alfa",
        de: "Alpha-Endivie, Floink und Karnimani",
        it: "Chikorita, Tepig e Totodile alfa",
        ja: "オヤブンのチコリータ・ポカブ・ワニノコ"
      }),
      shiny: false,
      start: "2026-04-02",
      end: null,
      regions: ["worldwide"],
      games: ["Pokémon HOME", "Pokémon Legends: Z-A"],
      method: Object.freeze({
        fr: "Cadeau Mystère dans l’application mobile Pokémon HOME",
        en: "Mystery Gift in the Pokémon HOME mobile app"
      }),
      details: Object.freeze({
        fr: "Déposez pour la première fois dans Pokémon HOME un Pokémon provenant de Pokémon Légendes : Z-A. Les versions Switch et mobile de HOME doivent utiliser le même compte Nintendo.",
        en: "Deposit a Pokémon from Pokémon Legends: Z-A into Pokémon HOME for the first time. The Switch and mobile versions of HOME must use the same Nintendo Account."
      }),
      sourceUrl: "https://legends.pokemon.com/en-us/news/pokemon-home-connectivity"
    })
  ])
});
