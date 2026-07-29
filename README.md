# Pokémon Shinydex

Gestionnaire de collection shiny moderne, autonome et pensé pour durer. Le site
réunit le Pokédex national et les apparences visuellement distinctes : formes
régionales, saisons de Vivaldaim, alphabet de Zarbi, motifs de Prismillon,
différences mâle/femelle disponibles, etc.

## Fonctions

- une seule fiche par espèce, même lorsque plusieurs formes ou différences
  mâle/femelle existent ;
- sélection détaillée des variantes par clic ou après deux secondes de survol ;
- défilement automatique des apparences réellement différentes dans la fiche
  principale et compteur visuel dans son coin supérieur droit : deux sexes
  identiques restent sélectionnables séparément sans être comptés deux fois ;
- sexes mâle et femelle enregistrables séparément lorsque l’espèce accepte les
  deux, sans inventer de second sexe pour les espèces exclusivement mâles,
  femelles ou asexuées ;
- interface et noms Pokémon disponibles en français, anglais, espagnol,
  allemand, italien et japonais ;
- couleurs distinctes correspondant à chaque type dans les bulles ;
- clic sur une variante : passage du sprite normal au sprite shiny et ajout à
  la collection ;
- quantité personnalisable pour chaque shiny possédé ;
- sauvegarde automatique dans le navigateur, export et import JSON ;
- compte Firebase facultatif par e-mail/mot de passe avec synchronisation entre
  appareils et fusion initiale sans perte ;
- recherche tolérante aux accents, filtres par génération, type et état ;
- statistiques par apparence, espèce et nombre total d’exemplaires ;
- interface responsive, accessible, installable et utilisable hors ligne ;
- favicon Poké Ball accompagné d’étincelles shiny ;
- données, sprites normaux et shiny entièrement locaux : aucune requête PokeAPI
  ou GitHub depuis le site.

## Sauvegarde Firebase

Le site utilise le projet Firebase dédié `pokemon-shinydex`, avec
l’authentification e-mail/mot de passe. Les données sont enregistrées dans :

```text
users/{uid}/apps/shinydex
```

La sauvegarde locale reste active en permanence ; au premier accès à un compte,
les copies locale et cloud sont fusionnées en conservant les quantités les plus
élevées.

Les règles privées par utilisateur nécessaires sont fournies dans
`firestore.rules`. Elles n’autorisent l’accès qu’au document Shinydex du compte
connecté. Les fichiers `.firebaserc` et `firebase.json` ciblent directement le
projet `pokemon-shinydex`.

Pour publier les règles depuis un terminal :

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

## Mise à jour automatique

Le workflow `.github/workflows/pages.yml` valide et déploie chaque envoi sur
`main`. Chaque lundi, il reconstruit aussi la base depuis les sources PokeAPI,
regroupe les sprites dans des planches WebP optimisées, valide le résultat,
enregistre les nouveautés et publie la nouvelle version.

La source PokeAPI n’est utilisée que par le script de construction
`tools/update-data.mjs`, jamais par les visiteurs.

## Commandes locales

```bash
npm ci
npm run update-data
npm run check
```

Le site prêt à publier est généré dans `_site`.

## Première activation de GitHub Pages

GitHub exige parfois une activation manuelle unique :

1. ouvrir **Settings → Pages** dans le dépôt ;
2. choisir **GitHub Actions** dans **Build and deployment → Source** ;
3. relancer le workflow depuis l’onglet **Actions**.

Après cela, tous les déploiements et toutes les mises à jour sont automatiques.
