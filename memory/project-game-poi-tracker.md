---
name: project-game-poi-tracker
description: What Game POI Tracker is — a React app for noting game points of interest (targeting Subnautica 2)
metadata: 
  node_type: memory
  type: project
  originSessionId: 40a2bdc8-a325-4318-b9c0-a667799498c3
---

**Game POI Tracker** — application React (`.jsx`) de notation de points d'intérêt (POI) pour jeux vidéo, ciblée sur **Subnautica 2**.

Stack : React 18 (JSX + hooks), Vite, pnpm, hébergée sur CodeSandbox connecté à GitHub (sync auto). Aucune dépendance UI externe — tout en CSS-in-JS inline + canvas 2D natif. Esthétique « HUD jeu vidéo » : fond `#0D0F14`, accent cyan `#00E5FF`, vert néon `#39FF14`, police monospace.

Fichier principal réel : `src/App.js` (la mémoire disait `.jsx` — c'est bien `.js`), composant unique contenant `CoordInput` (saisie avec bouton ± pour inverser le signe), `MapView` (carte canvas interactive XZ : zoom scroll, pan drag, tooltip, sélection clic, label Y), `POICard` (carte de liste), `ZonesView` (gestion des zones), et `App` (racine + état).

Fonctionnalités : saisie POI (nom, coords 3D X/Y/Z, catégorie, note) ; 6 catégories (Trésor ◈, Ennemi ⚠, PNJ ◉, Secret ✦, Spawn ⟳, Autre ◆) ; bascule d'ordre des axes `X Y Z` ↔ `X Z Y` (ordre Subnautica 2) ; 3 vues Liste ☰ / Carte ⊕ / **Zones ⬠** ; recherche par nom/note ; filtres par catégorie ; tri date/nom/catégorie ; persistance `localStorage` (clé `poi-tracker-v1`, sauvegarde auto) ; export/import JSON (fusion sans doublons par id). Barre d'outils **compacte à icônes** (recherche/filtres/axes/import repliés par défaut, un panneau ouvert à la fois). Sur la carte, le zoom n'agrandit **pas** les marqueurs/texte (taille écran fixe) : il ne fait qu'écarter les points ; molette et glissé bloquent le scroll de page (écouteurs natifs non-passifs + `touch-action`).

**Zones** : liste ordonnée de points délimitant une aire (bordure de carte Subnautica 2), distincte des POI. Créées/éditées dans la vue Zones ; polygone rempli si `closed`, sinon polyligne ; couleur par zone ; réordonnancement ▲▼ ; migration d'un POI en point via sélecteur « → zone » sur `POICard` ; numéros de sommets sur la carte activables par zone (`showIndices`). Voir [[poi-data-format]] pour le schéma.

Voir [[game-poi-tracker-links]], [[poi-data-format]], [[devcontainer-claude-code-setup]].
