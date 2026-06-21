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

Fichier d'export (`poi-export.json`) :
```json
{
  "version": 1,
  "coordMode": "xzy",
  "pois": [ ... ]
}
```

`coords` est toujours stocké en `[X, Y, Z]` ; `coordMode` (`xyz` ou `xzy`) ne change que l'affichage. L'import fusionne les POI sans créer de doublons (déduplication par `id`).
