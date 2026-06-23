#!/usr/bin/env bash
# Recopie la mémoire versionnée du projet (memory/) vers le dossier
# mémoire de Claude Code, pour la rendre persistante entre postes.
#
# Claude Code encode le chemin du projet en remplaçant chaque caractère
# non alphanumérique par "-" (ex: /project/workspace -> -project-workspace).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PROJECT_DIR/memory"

if [ ! -d "$SRC" ]; then
  echo "[sync-memory] Aucun dossier memory/ à synchroniser, on saute."
  exit 0
fi

ENCODED="$(printf '%s' "$PROJECT_DIR" | sed 's/[^a-zA-Z0-9]/-/g')"
DEST="${HOME}/.claude/projects/${ENCODED}/memory"

mkdir -p "$DEST"
cp -f "$SRC"/*.md "$DEST"/
echo "[sync-memory] Mémoire copiée: $SRC -> $DEST"
