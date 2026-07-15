import generic from "./generic";
import subnautica2 from "./subnautica2";

// Un jeu = un fichier. Pour ajouter un jeu : créer src/games/<id>.js sur ce
// modèle, puis l'ajouter ici. Rien d'autre à toucher dans le reste de l'app.
export const GAMES = { generic, subnautica2 };

export const GAME_LIST = Object.values(GAMES);

// "generic" reste le jeu par défaut : c'est la destination de migration
// pour les données créées avant l'introduction du multi-jeux.
export const DEFAULT_GAME_ID = "generic";

export function getGame(id) {
  return GAMES[id] ?? GAMES[DEFAULT_GAME_ID];
}

// Retrouve une catégorie du jeu par id, avec repli sur "other" (ou la
// dernière catégorie déclarée si "other" n'existe pas) si la catégorie
// stockée sur un POI n'existe plus dans la config du jeu.
export function findCategory(game, categoryId) {
  const cats = game.categories;
  return (
    cats.find((c) => c.id === categoryId) ??
    cats.find((c) => c.id === "other") ??
    cats[cats.length - 1]
  );
}
