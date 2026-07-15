// Config Subnautica 2. Taxonomie des catégories inspirée des outils
// communautaires existants (regroupement Emplacements / Ressources /
// Créatures / Sites), sans réutiliser leurs icônes ni leurs images —
// voir le plan pour le détail des sources consultées.
export default {
  id: "subnautica2",
  name: "Subnautica 2",
  defaultCategory: "site",
  categories: [
    { id: "resource", label: "Ressource", icon: "◈", color: "#F0A500" },
    { id: "base", label: "Base", icon: "◉", color: "#00E5FF" },
    { id: "creature", label: "Créature", icon: "⚠", color: "#FF4444" },
    { id: "site", label: "Site", icon: "✦", color: "#39FF14" },
    { id: "other", label: "Autre", icon: "◆", color: "#C8D6E5" },
  ],
  // Sous-catégories facultatives : affinent le nom sans multiplier les
  // couleurs. Pas encore branchées dans l'UI (prévu pour une itération
  // suivante) — gardé ici pour ne pas avoir à retoucher la config plus tard.
  subtypes: {
    resource: [
      "Titane",
      "Cuivre",
      "Or",
      "Argent",
      "Quartz",
      "Soufre",
      "Plomb",
      "Lithium",
      "Sel",
    ],
  },
  // POI connus dès le début du jeu, non-spoiler : toujours visibles.
  predefinedPois: [
    {
      id: "survival-pod",
      name: "Capsule de survie",
      category: "base",
      coords: [-3318, 0, 4334], // [X, Y, Z]
      alwaysVisible: true,
    },
    // Les futurs POI prédéfinis SANS alwaysVisible seront révélés via la
    // recherche explicite de points à proximité (cf. handleDiscoverNearby
    // dans App.js) — jamais automatiquement.
  ],
  // Pas de fond de carte pour l'instant (voir plan, §6) : pas d'image
  // libre de droits disponible pour Subnautica 2 à ce jour.
  background: null,
};
