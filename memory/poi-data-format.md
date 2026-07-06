---
name: poi-data-format
description: Data shapes for Game POI Tracker — a single POI object and the JSON export file
metadata: 
  node_type: memory
  type: reference
  originSessionId: 40a2bdc8-a325-4318-b9c0-a667799498c3
---

Formats de données de [[project-game-poi-tracker]].

Un POI :
```json
{
  "id": 1234567890,
  "name": "Coffre caché",
  "category": "treasure",
  "coords": [142.5, -38.0, 77.2],
  "note": "Derrière la cascade",
  "createdAt": 1718900000000
}
```

Fichier d'export (`poi-export.json`), **version 2** (les fichiers v1 sans `zones` restent importables) :
```json
{
  "version": 2,
  "coordMode": "xzy",
  "zones": [ ... ],
  "pois": [ ... ]
}
```

Une zone (délimitation d'aire de carte, distincte des vrais POI) :
```json
{
  "id": 1234567891,
  "name": "Bordure carte",
  "color": "#00E5FF",
  "closed": true,
  "points": [ { "id": 1, "coords": [X, Y, Z] } ],
  "createdAt": 1718900000000
}
```
`closed: true` → polygone rempli sur la carte ; `false` → polyligne reliant les `points` dans l'ordre du tableau (= ordre du tracé). Les points de zone ne sont pas nommés.

`coords` est toujours stocké en `[X, Y, Z]` (POI comme points de zone) ; `coordMode` (`xyz` ou `xzy`) ne change que l'affichage. L'import fusionne POI **et** zones sans créer de doublons (déduplication par `id`). Persistance `localStorage` (clé `poi-tracker-v1`) : `{ pois, coordMode, invertZ, zones }`.
