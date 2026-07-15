// Jeu "générique" : reprend les catégories historiques du tracker.
// Sert de destination de migration pour les données créées avant
// l'introduction du multi-jeux (aucun jeu n'était alors précisé).
export default {
  id: "generic",
  name: "Générique",
  defaultCategory: "other",
  categories: [
    { id: "treasure", label: "Trésor", icon: "◈", color: "#FFD700" },
    { id: "enemy", label: "Ennemi", icon: "⚠", color: "#FF4444" },
    { id: "npc", label: "PNJ", icon: "◉", color: "#AA88FF" },
    { id: "secret", label: "Secret", icon: "✦", color: "#00E5FF" },
    { id: "spawn", label: "Spawn", icon: "⟳", color: "#39FF14" },
    { id: "other", label: "Autre", icon: "◆", color: "#C8D6E5" },
  ],
  // Pas de POI connus d'avance pour un jeu générique.
  predefinedPois: [],
  // Pas de fond de carte pour le jeu générique.
  background: null,
};
