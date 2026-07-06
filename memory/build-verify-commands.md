---
name: build-verify-commands
description: Comment builder/vérifier la compilation de game-poi-tracker dans ce devcontainer (contournements pnpm/ESLint)
metadata:
  type: reference
---

Pour vérifier que `src/App.js` de [[project-game-poi-tracker]] compile, dans ce devcontainer :

```bash
CI=false DISABLE_ESLINT_PLUGIN=true node_modules/.bin/react-scripts build
```
Puis nettoyer : `rm -rf build`.

Pièges de l'environnement :
- `pnpm build` échoue : il tente un `pnpm install` interactif → `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Appeler `react-scripts` directement via `node_modules/.bin/` contourne le check de deps.
- Sans `DISABLE_ESLINT_PLUGIN=true`, le build échoue sur `Cannot find module '@typescript-eslint/parser'` (déclaré dans `.eslintrc.json` mais absent) — erreur d'env, sans rapport avec le code.
- `CI=false` évite que les warnings soient traités comme des erreurs.

Vérif syntaxe rapide (sans build) via Babel du store pnpm : `require('@babel/core').transform(...)` avec le preset `@babel/preset-react` trouvé sous `node_modules/.pnpm/`.

Pas de pilotage navigateur disponible ici : la validation end-to-end visuelle (rendu carte/zones) reste manuelle via `pnpm start`.
