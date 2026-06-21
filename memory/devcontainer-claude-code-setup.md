---
name: devcontainer-claude-code-setup
description: In-progress goal — run Claude Code inside the CodeSandbox devcontainer without exposing the API key
metadata: 
  node_type: memory
  type: project
  originSessionId: 40a2bdc8-a325-4318-b9c0-a667799498c3
---

Travail en cours sur [[project-game-poi-tracker]] (au 21 juin 2026) : faire tourner **Claude Code** dans le devcontainer CodeSandbox sans exposer la clé API.

**Why:** permettre à Claude Code de modifier le code → commit → push → resync CodeSandbox, en injectant la clé via un secret plutôt qu'en clair.

**How to apply:** `.devcontainer/devcontainer.json` cible :
```json
{
  "name": "game-poi-tracker",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code",
  "remoteEnv": {
    "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}"
  },
  "forwardPorts": [3000]
}
```
Configurer le secret CodeSandbox `ANTHROPIC_API_KEY` (Settings → Secrets) ; il est injecté comme variable d'env dans le devcontainer, puis `claude` est lancé dans le terminal intégré.

Problèmes déjà résolus sur le projet : coords négatives sur mobile (`type="text"` + `inputMode="numeric"` + bouton ±) ; `ERR_PNPM_IGNORED_BUILDS` sur core-js (`pnpm approve-builds` / `.npmrc` avec `approve-builds[]=core-js`, déjà committé) ; impossibilité de mettre à jour l'artifact claude.ai → migration vers CodeSandbox + GitHub.
