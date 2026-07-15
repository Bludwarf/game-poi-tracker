# Plan : sélection du jeu, POI prédéfinis, fond de carte à découvrir

## 1. Vue d'ensemble

Trois évolutions imbriquées :

1. **Multi-jeux** : chaque jeu a son propre jeu de catégories de POI.
2. **POI prédéfinis** : points connus dès le début (pas de spoiler), + points "à découvrir" qui n'apparaissent que si l'utilisateur saisit des coordonnées proches.
3. **Fond de carte évolutif** ("fog of war") : image de fond qui se révèle progressivement.

La 1 et la 2 sont raisonnables à livrer rapidement. La 3 est nettement plus lourde et dépend d'un asset (l'image de fond) qu'il faut clarifier avant de s'engager (voir §6).

---

## 2. Modèle de données

### 2.1 Config par jeu (nouveau dossier `src/games/`)

```js
// src/games/subnautica2.js
export default {
  id: "subnautica2",
  name: "Subnautica 2",
  categories: [
    { id: "resource", label: "Ressource", color: "#F0A500", icon: "Pickaxe" },
    { id: "base",     label: "Base",      color: "#00E5FF", icon: "Home" },
    { id: "creature", label: "Créature",  color: "#FF4D4D", icon: "PawPrint" },
    { id: "site",     label: "Site",      color: "#7CFC7C", icon: "MapPin" },
    // ...
  ],
  // Sous-types optionnels (ex. Ressource -> Titane/Cuivre/Or...) pour affiner
  // le nom sans multiplier les catégories couleur.
  subtypes: {
    resource: ["Titane", "Cuivre", "Or", "Argent", "Quartz", "Plomb", "Lithium", "Sel"],
  },
  // POI connus dès le début, non-spoiler
  predefinedPois: [
    {
      id: "survival-pod",
      name: "Capsule de survie",
      category: "base",
      coords: { x: -3318, y: 0, z: 4334 },
      alwaysVisible: true, // pas soumis à la découverte par proximité
    },
    // Les futurs POI prédéfinis SANS alwaysVisible seront révélés par
    // proximité, uniquement sur demande explicite de l'utilisateur (cf. §4).
  ],
}
```

(Pas de préfixe type `sn2-` dans les ids : chaque id de POI prédéfini n'a besoin d'être unique qu'à l'intérieur de son propre fichier de jeu, donc `predefinedId` stocké côté app sera de toute façon composé de `gameId` + `id` si besoin de le référencer globalement.)

```js
// src/games/index.js
import subnautica2 from "./subnautica2";
export const GAMES = { subnautica2 };
export const DEFAULT_GAME_ID = "subnautica2";
```

Un jeu = un fichier. Ajouter un jeu plus tard = ajouter un fichier + une ligne dans `GAMES`, sans toucher au reste de l'app.

### 2.2 POI utilisateur : distinguer prédéfini vs personnalisé

Tu as raison : pas besoin de dupliquer un POI prédéfini découvert dans la liste `pois` — toutes ses infos (nom, catégorie, coordonnées) existent déjà dans la config du jeu (`predefinedPois`). On se contente de retenir **quels ids ont été découverts**.

- `pois` (stockage/état) : **uniquement les POI personnalisés (`custom`)**, structure inchangée par rapport à l'existant.
- `discoveredPredefinedIds` : liste d'ids référençant `predefinedPois` de la config du jeu actif.
- À l'affichage (carte, liste, recherche), on calcule une liste fusionnée à la volée :
  ```js
  const visiblePois = [
    ...customPois.map(p => ({ ...p, origin: "custom" })),
    ...game.predefinedPois
      .filter(p => p.alwaysVisible || discoveredPredefinedIds.includes(p.id))
      .map(p => ({ ...p, origin: "predefined" })),
  ];
  ```
- Avantage direct : si on corrige une coordonnée ou un nom dans `predefinedPois` plus tard (correction de la config du jeu), les POI déjà "découverts" par les utilisateurs profitent automatiquement de la correction, sans script de migration.

### 2.3 Format d'export (nouvelle version)

```json
{
  "schemaVersion": 2,
  "gameId": "subnautica2",
  "pois": [ /* uniquement les POI personnalisés (custom) */ ],
  "discoveredPredefinedIds": ["survival-pod", "..."],
  "zones": [ /* inchangé */ ]
}
```

- `schemaVersion` permet de gérer les futures migrations proprement.
- Migration automatique des fichiers `poi-tracker-v1` existants : à l'import, si pas de `gameId` → on assume `subnautica2` (seul jeu existant au moment de la bascule) et `schemaVersion: 1`.
- Idem pour le `localStorage` (`poi-tracker-v1`) : migration silencieuse au premier chargement vers une nouvelle clé `poi-tracker-v2`.

---

## 3. Sélecteur de jeu (UI)

Tu as raison, ce composant sera peu utilisé au quotidien : le jeu est en pratique déjà connu dès qu'on charge un export JSON (`gameId` dedans). Il ne doit donc pas prendre la place d'un élément plus utile (recherche, filtres, ajout de POI...).

- Pas de gros dropdown dans le header. À la place : un petit indicateur texte/icône discret (ex. dans la barre de titre ou un menu "⚙ Paramètres" existant/à créer), du style `🎮 Subnautica 2 ▾` — cliquable pour changer de jeu, mais visuellement secondaire.
- Il ne sert en pratique que dans deux cas : démarrer une carte totalement vierge (avant tout import), ou basculer explicitement vers un autre jeu une fois qu'il y en aura plusieurs.
- **Décision retenue : un seul jeu actif à la fois.** Changer de jeu charge sa propre liste de POI/zones/catégories (localStorage à clé préfixée par `gameId`, ex. `poi-tracker-v2:subnautica2`). Chaque jeu a son propre "monde" complètement indépendant.
- Le changement de `gameId` recalcule :
  - la liste des catégories disponibles (formulaire d'ajout de POI, filtres, légende carte)
  - les POI prédéfinis disponibles pour la recherche par proximité (§4)

---

## 4. Découverte des POI prédéfinis (fog of war "liste")

**Décision retenue : la découverte est une action explicite de l'utilisateur, jamais automatique.** Par défaut, ajouter un point crée un POI **personnalisé** (`custom`) — comme aujourd'hui, sans aucune vérification de proximité en arrière-plan. On évite ainsi qu'un simple ajout de POI ne révèle involontairement un élément non désiré.

Nouveau bouton/action dédié, par exemple **"🔍 Chercher un point connu à proximité"**, disponible :
- depuis le formulaire d'ajout de POI (à côté du bouton "Ajouter"), une fois des coordonnées saisies ;
- ou comme action indépendante ("Rechercher depuis mes coordonnées actuelles").

Comportement au clic, avec les coordonnées saisies :

1. Pour le jeu actif, parmi `predefinedPois` dont l'`id` n'est pas déjà dans `discoveredPredefinedIds`, calculer la distance 3D euclidienne (X/Y/Z) avec les coordonnées saisies.
2. Prendre le plus proche (**décision retenue : distance 3D, sans rayon de découverte fixe**) → proposer à l'utilisateur "Point trouvé à proximité : *Nom* (à X unités) — le découvrir ?" avant de confirmer l'ajout à `discoveredPredefinedIds` (une confirmation explicite plutôt qu'une découverte silencieuse, pour rester cohérent avec l'esprit "action volontaire").
3. Une fois découvert, le point apparaît dans la liste/carte/recherche comme les autres, avec `origin: "predefined"` (badge/icône différente pour le distinguer visuellement des POI personnels).

⚠️ **Point d'attention conservé** : sans seuil de distance, la recherche renvoie toujours *un* résultat (le plus proche, même lointain) tant qu'il reste des POI prédéfinis non découverts. Comme c'est maintenant une action explicite avec confirmation affichant la distance, l'utilisateur garde la main pour ignorer un résultat trop éloigné — donc plus de risque de spoiler accidentel.

Les POI prédéfinis **non découverts** restent totalement invisibles ailleurs dans l'app (pas d'icône fantôme, pas de "?") — conforme à ta demande de ne pas spoiler.

---

## 5. Icônes par catégorie

- Utiliser `lucide-react` (déjà disponible dans les artifacts/le projet) pour un set cohérent, libre de droits : pioche pour Ressource, maison pour Base, empreinte de patte pour Créature, drapeau/marqueur pour Site, etc.
- Un champ `icon` dans chaque catégorie de la config du jeu référence le nom du composant lucide à utiliser.
- On garde la structure de regroupement inspirée de mapgenie (Emplacements / Ressources / Plans / Créatures) pour les filtres, sans réutiliser leurs images.

---

## 6. Fond de carte évolutif (le plus gros morceau)

Trois sous-problèmes distincts : l'image elle-même, comment elle est branchée à un jeu, et comment on l'aligne avec les coordonnées des POI.

### 6.1 L'image de fond

Décision retenue : pas d'image que tu fournis, on veut une image libre de droits. Problème concret : Subnautica 2 est en accès anticipé et il n'existe pas de carte officielle du monde publiée sous licence libre (celles de mapgenie et consorts sont des reconstructions propriétaires de ces sites). Deux options réalistes :
- **Option A (recommandée) : fond généré proceduralement.** On génère nous-mêmes un dégradé océanique stylisé (variations de bleu/turquoise, texture de bruit type Perlin pour évoquer courants/reliefs) en Canvas/SVG — zéro dépendance externe, zéro souci de droits.
- **Option B : texture libre générique** (CC0, ex. OpenGameArt) plaquée en tuile — moins spécifique à Subnautica 2, à valider au cas par cas selon la licence exacte.
- Je pars sur l'**option A** par défaut ; dis-moi si tu préfères l'option B.

### 6.2 Comment le fond est branché à un jeu — et comment *toi* tu pourrais en ajouter un plus tard

Oui, c'est configurable par jeu, et pensé pour que tu puisses ajouter/remplacer un fond toi-même sans toucher au code :

- Chaque config de jeu peut déclarer un `background` optionnel :
  ```js
  // src/games/subnautica2.js
  background: {
    // Nom de fichier attendu dans /public/backgrounds/ (ou importé via
    // l'UI d'upload, cf. ci-dessous) — pas d'image en dur dans le repo
    // au départ puisqu'on n'en a pas de valide sous licence libre.
    image: "subnautica2-world.webp",
    calibration: {
      // Deux points de repère : coordonnées in-game connues <-> position
      // en pixels sur l'image. Ça suffit à calculer l'échelle et le
      // décalage (une transformation affine simple, pas de rotation).
      pointA: { world: { x: -3318, z: 4334 }, pixel: { x: 210, y: 140 } },
      pointB: { world: { x:  1200, z: -800 }, pixel: { x: 980, y: 760 } },
    },
  },
  ```
- Si `background` est absent (cas par défaut au lancement) → pas de fond, on garde juste le style HUD actuel (grille néon), et le "brouillard qui se dissipe" n'a rien à révéler visuellement — la fonctionnalité de découverte (§4) continue de fonctionner indépendamment.
- **Pour ajouter un fond toi-même sans coder** : je prévois un petit écran "Paramètres du fond de carte" qui permet d'uploader une image (stockée dans le navigateur, pas dans l'export JSON — trop lourd) puis de faire la calibration à la souris (voir 6.3). Pas besoin de connaître le format `background` ci-dessus, c'est juste ce que l'UI produit en interne.

### 6.3 L'alignement avec les POI (calibration)

C'est le point clé si tu trouves une image un jour : je ne peux pas deviner comment son pixel (0,0) correspond aux coordonnées in-game — il faut une calibration manuelle, mais rapide :

1. Tu choisis (ou places) **2 POI dont tu connais précisément les coordonnées in-game** (ex. la capsule de survie).
2. Dans l'écran de calibration, tu cliques sur l'image de fond à l'endroit exact où se trouve chacun de ces 2 points.
3. L'app en déduit automatiquement l'échelle (pixels par unité de jeu, potentiellement différente en X et en Z si l'image n'est pas parfaitement carrée par rapport au monde) et le décalage — exactement le même principe mathématique que pour `toCanvas` (cf. le zoom uniforme qu'on vient de corriger), mais appliqué à une image bitmap plutôt qu'à un canvas généré.
4. Cette calibration (2 points) est tout ce qu'il faut stocker — pas besoin de recalibrer si l'image change de taille d'affichage, seulement si tu changes d'image source.

Avec 2 points seulement, on suppose que l'image n'est pas tournée par rapport au repère du jeu (ce qui est le cas pour une carte "vue du dessus" classique). Si jamais l'image trouvée est tournée, il faudrait un 3e point — je ne complexifie pas tant que ce cas ne se présente pas.

### 6.4 Mécanisme de révélation (indépendant de l'image)

Un calque opaque par-dessus le fond, avec des cercles "détourés" (composite `destination-out` sur un `<canvas>`) centrés sur chaque POI découvert (prédéfini ou personnalisé), rayon configurable, dissipation douce (dégradé radial plutôt que bord net) pour un effet "brouillard qui se dissipe".

---

## 7. Découpage en phases livrables

| Phase | Contenu | Risque/Effort |
|---|---|---|
| **1** | Modèle multi-jeux (`src/games/`), sélecteur de jeu, catégories Subnautica 2, migration du stockage/export vers `schemaVersion: 2` + `gameId` | Faible |
| **2** | Icônes par catégorie (lucide-react) | Faible |
| **3** | POI prédéfinis non-spoiler (toujours visibles, ex. capsule de survie) | Faible |
| **4** | Mécanique de découverte par proximité (POI "cachés" → révélés) + distinction visuelle prédéfini/personnalisé | Moyen |
| **5** | Fond de carte + brouillard qui se dissipe | Élevé, bloqué par le choix de l'image de fond |

---

## 8. Décisions tranchées

- **Modèle `pois`/découverte** : `pois` ne contient que les POI personnalisés ; les POI prédéfinis découverts sont juste des ids dans `discoveredPredefinedIds`, résolus depuis la config du jeu à l'affichage (pas de duplication).
- **Ids des POI prédéfinis** : pas de préfixe jeu (ex. `sn2-`), scopés naturellement par fichier de jeu.
- **Sélecteur de jeu** : composant discret, pas dans le header principal — utile seulement pour démarrer une carte vierge ou changer explicitement de jeu.
- **Découverte des POI prédéfinis** : action explicite (bouton dédié + confirmation), jamais automatique en arrière-plan — distance 3D (X/Y/Z), on propose le plus proche, sans rayon fixe.
- **Jeux stockés** : un seul jeu actif à la fois, données totalement séparées par `gameId`.
- **Fond de carte (phase 5)** : pas d'image fournie par toi → fond généré proceduralement par défaut (option A, §6.1) ; configurable par jeu via un `background` avec calibration à 2 points (§6.2-6.3) si tu ajoutes une image toi-même plus tard, sans avoir à coder.

Plus de blocage identifié pour démarrer la phase 1.
