# Pokémon Shinydex

Gestionnaire de collection shiny moderne, autonome et pensé pour durer. Le site
réunit le Pokédex national et les apparences visuellement distinctes : formes
régionales, saisons de Vivaldaim, alphabet de Zarbi, motifs de Prismillon,
différences mâle/femelle disponibles, etc.

## Fonctions

- une seule fiche par espèce, même lorsque plusieurs formes ou différences
  mâle/femelle existent ;
- sélection détaillée des variantes par clic ;
- défilement automatique des apparences réellement différentes dans la fiche
  principale et compteur visuel dans son coin supérieur droit : deux sexes
  identiques restent sélectionnables séparément sans être comptés deux fois ;
- sexes mâle et femelle enregistrables séparément lorsque l’espèce accepte les
  deux, sans inventer de second sexe pour les espèces exclusivement mâles,
  femelles ou asexuées ;
- sexe indiqué sur chaque fiche principale et explication française du
  dimorphisme dans le sélecteur lorsque les sprites mâle et femelle diffèrent ;
- Méga-Évolutions, formes Gigamax et autres transformations disposant de
  sprites normaux et shiny locaux ;
- interface et noms Pokémon disponibles en français, anglais, espagnol,
  allemand, italien et japonais ;
- couleurs distinctes correspondant à chaque type dans les bulles ;
- clic sur une variante : passage du sprite normal au sprite shiny et ajout à
  la collection ;
- quantité personnalisable pour chaque shiny possédé, avec un palier
  `Exception` situé entre le retrait et la quantité 1 ;
- formes non permanentes automatiquement proposées en exception (Méga,
  Gigamax, transformations de combat, fusions et formes liées à un objet) :
  elles comptent comme apparences et représentent l’espèce, sans augmenter le
  nombre total d’exemplaires shiny ;
- sauvegarde automatique dans le navigateur, export et import JSON ;
- compte Firebase facultatif par e-mail/mot de passe avec synchronisation entre
  appareils et fusion initiale sans perte ;
- recherche tolérante aux accents, filtres par génération, type et état ;
- statistiques par apparence, espèce et nombre total d’exemplaires, avec une
  complétion calculée uniquement sur les espèces possédant un shiny légal ;
- les 24 espèces et les formes sans aucun shiny légal restent visibles avec
  leur contrôle shiny, un badge explicatif et un filtre dédié, mais sont
  exclues de la complétion ;
- panneau repliable d’informations placé entre les statistiques et la
  collection, avec un bandeau automatique des titres lorsqu’il est fermé et un
  carrousel horizontal des distributions lorsqu’il est ouvert, accompagné des
  dates, méthodes, conditions et sources officielles localisées ; la page
  française est utilisée lorsqu’un équivalent officiel existe ;
- aperçu temporaire du modèle shiny au survol des fiches de l’accueil et des
  fiches du sélecteur, sans modifier la collection ;
- fermeture explicite du sélecteur avec son bouton dédié ;
- interface responsive, accessible, installable et utilisable hors ligne ;
- utilisation fluide de la largeur disponible, y compris sur les écrans
  ultralarges ;
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

Le workflow `.github/workflows/pages.yml` valide chaque demande de fusion et
déploie chaque envoi sur `main`. Chaque lundi, il reconstruit aussi la base
depuis les sources PokeAPI, regroupe les sprites dans des planches WebP
optimisées, valide le résultat, enregistre les nouveautés et publie la nouvelle
version.

Le workflow `.github/workflows/monitor-live-data.yml` contrôle chaque jour les
sources de légalité shiny et de distributions mondiales. Sans IA, il détecte et
vérifie aussi automatiquement l’équivalent français officiel de chaque source
grâce aux liens de langue `hreflang` et aux chemins régionaux stables des sites
Pokémon. Il enregistre ces correspondances dans
`data/distribution-source-locales.js`. Il mémorise par ailleurs les empreintes
des sources et ouvre ou complète automatiquement une issue GitHub dès qu’une
source change ou devient inaccessible afin que les données éditoriales puissent
être revérifiées avant publication.

La source PokeAPI n’est utilisée que par le script de construction
`tools/update-data.mjs`, jamais par les visiteurs.

## Commandes locales

```bash
npm ci
npm run update-data
npm run monitor-live-data
npm run localize-distribution-sources
npm run check
```

Le site prêt à publier est généré dans `_site`.

## Première activation de GitHub Pages

GitHub exige parfois une activation manuelle unique :

1. ouvrir **Settings → Pages** dans le dépôt ;
2. choisir **GitHub Actions** dans **Build and deployment → Source** ;
3. relancer le workflow depuis l’onglet **Actions**.

Après cela, tous les déploiements et toutes les mises à jour sont automatiques.
