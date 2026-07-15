import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { GAMES, GAME_LIST, DEFAULT_GAME_ID, getGame, findCategory } from "./games";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récent" },
  { value: "date_asc", label: "Plus ancien" },
  { value: "name_asc", label: "Nom A→Z" },
  { value: "cat", label: "Catégorie" },
];

// Modes d'affichage des coordonnées
// order = indices dans coords[] [X=0, Y=1, Z=2]
const COORD_MODES = [
  {
    id: "xyz",
    label: "X Y Z",
    axes: ["X", "Y", "Z"],
    order: [0, 1, 2],
    mapH: 0,
    mapV: 2,
  },
  {
    id: "xzy",
    label: "X Z Y",
    axes: ["X", "Z", "Y"],
    order: [0, 2, 1],
    mapH: 0,
    mapV: 2,
  },
];

const LEGACY_STORAGE_KEY = "poi-tracker-v1";
const ACTIVE_GAME_KEY = "poi-tracker-active-game";
const storageKeyFor = (gameId) => `poi-tracker-v2:${gameId}`;

// Palette des zones : chaque zone reçoit une couleur (auto ou choisie).
const ZONE_COLORS = [
  "#00E5FF",
  "#39FF14",
  "#FFD700",
  "#FF4444",
  "#AA88FF",
  "#FF9F1C",
  "#2EC4B6",
  "#E71D73",
];

const btnStyle = (color) => ({
  background: "transparent",
  border: `1px solid ${color}55`,
  color,
  borderRadius: 4,
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "monospace",
});

const EMPTY_FORM = {
  name: "",
  category: "other",
  coords: ["", "", ""],
  note: "",
};

// Conteneur d'un panneau d'options révélé par la barre compacte.
const PANEL_STYLE = {
  marginTop: 10,
  background: "#1A1F2E",
  border: "1px solid #00E5FF22",
  borderRadius: 8,
  padding: "12px 14px",
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

// Pastille indiquant qu'un filtre est actif sous une icône repliée.
function ActiveDot() {
  return (
    <span
      style={{
        position: "absolute",
        top: 3,
        right: 3,
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "#39FF14",
      }}
    />
  );
}

/* ── localStorage helpers ──────────────────────────────── */

// Jeu actif : mémorisé indépendamment des données (rarement changé, cf. plan).
function loadActiveGameId() {
  try {
    const id = localStorage.getItem(ACTIVE_GAME_KEY);
    return id && GAMES[id] ? id : null;
  } catch {
    return null;
  }
}

function saveActiveGameId(gameId) {
  try {
    localStorage.setItem(ACTIVE_GAME_KEY, gameId);
  } catch {}
}

// Charge l'état d'UN jeu donné (POI perso, découvertes, zones, préférences
// d'affichage). Chaque jeu a son propre "monde" complètement indépendant.
function loadGameState(gameId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(gameId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveGameState(gameId, pois, coordMode, invertZ, zones, discoveredPredefinedIds) {
  try {
    localStorage.setItem(
      storageKeyFor(gameId),
      JSON.stringify({ pois, coordMode, invertZ, zones, discoveredPredefinedIds })
    );
  } catch {}
}

// Migration ponctuelle : avant le multi-jeux, tout était stocké sous une
// seule clé sans notion de jeu. On rapatrie ces données vers le jeu
// "generic" (mêmes catégories qu'avant), une seule fois.
function migrateLegacyStateIfNeeded() {
  if (loadGameState(DEFAULT_GAME_ID)) return; // déjà migré (ou déjà utilisé)
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw);
    saveGameState(
      DEFAULT_GAME_ID,
      legacy.pois ?? [],
      legacy.coordMode,
      legacy.invertZ ?? false,
      legacy.zones ?? [],
      []
    );
  } catch {}
}

/* ── CoordInput ────────────────────────────────────────── */
function CoordInput({ label, value, onChange }) {
  const toggleSign = () => {
    const s = String(value).trim();
    if (s === "" || s === "-") {
      onChange(s === "-" ? "" : "-");
      return;
    }
    const n = parseFloat(s);
    if (!isNaN(n)) onChange(String(-n));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          color: "#00E5FF",
          fontSize: 10,
          fontFamily: "monospace",
          letterSpacing: 2,
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={toggleSign}
          style={{
            background: "#0D0F14",
            border: "1px solid #00E5FF33",
            color: "#00E5FF",
            fontFamily: "monospace",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 10px",
            borderRadius: 4,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ±
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder="0"
          style={{
            background: "#0D0F14",
            border: "1px solid #00E5FF33",
            color: "#39FF14",
            fontFamily: "monospace",
            fontSize: 16,
            padding: "8px 6px",
            borderRadius: 4,
            width: "100%",
            outline: "none",
            textAlign: "center",
            boxSizing: "border-box",
            minWidth: 0,
          }}
        />
      </div>
    </div>
  );
}

/* ── MapView ───────────────────────────────────────────── */
const MAP_SIZE = 520;
const PADDING = 40;

function MapView({ pois, zones = [], selectedId, onSelect, coordMode, invertZ, categories }) {
  const canvasRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef(null);
  const lastTouch = useRef(null);

  // Axes used for horizontal/vertical on the map
  const axisH = coordMode.mapH; // index in coords[]
  const axisV = coordMode.mapV; // index in coords[]
  const labelH = coordMode.axes[coordMode.order.indexOf(axisH)];
  const labelV = coordMode.axes[coordMode.order.indexOf(axisV)];

  const bounds = useMemo(() => {
    // Cadre la carte sur les POI ET les points de zone.
    const hs = [];
    const vs = [];
    const add = (coords) => {
      const h = Number(coords[axisH]);
      const v = Number(coords[axisV]);
      if (Number.isFinite(h) && Number.isFinite(v)) {
        hs.push(h);
        vs.push(v);
      }
    };
    pois.forEach((p) => add(p.coords));
    zones.forEach((z) => z.points.forEach((pt) => add(pt.coords)));
    if (!hs.length) return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    let [minX, maxX] = [Math.min(...hs), Math.max(...hs)];
    let [minZ, maxZ] = [Math.min(...vs), Math.max(...vs)];
    const padX = Math.max((maxX - minX) * 0.2, 50);
    const padZ = Math.max((maxZ - minZ) * 0.2, 50);
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minZ: minZ - padZ,
      maxZ: maxZ + padZ,
    };
  }, [pois, zones, axisH, axisV]);

  // Échelle commune aux deux axes : on calcule l'échelle qui ferait tenir
  // chaque axe séparément dans le cadre, puis on prend la MOYENNE des deux
  // au lieu de les appliquer indépendamment. Ainsi 1 unité de jeu occupe le
  // même nombre de pixels sur X et sur Z, et la carte n'est plus déformée.
  const view = useMemo(() => {
    const dw = MAP_SIZE - PADDING * 2,
      dh = MAP_SIZE - PADDING * 2;
    const scaleX = dw / (bounds.maxX - bounds.minX);
    const scaleZ = dh / (bounds.maxZ - bounds.minZ);
    const scale = (scaleX + scaleZ) / 2;
    return {
      dw,
      dh,
      scale,
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerZ: (bounds.minZ + bounds.maxZ) / 2,
    };
  }, [bounds]);

  const toCanvas = useCallback(
    (wh, wv) => {
      const { dw, dh, scale, centerX, centerZ } = view;
      const vOffset = (wv - centerZ) * scale;
      return {
        cx: PADDING + dw / 2 + (wh - centerX) * scale,
        cy: PADDING + dh / 2 + (invertZ ? vOffset : -vOffset),
      };
    },
    [view, invertZ]
  );

  // Inverse de toCanvas : retrouve les coordonnées monde à partir d'une
  // position écran, en utilisant la même échelle unique (nécessaire pour
  // que les graduations affichées correspondent aux marqueurs).
  const fromCanvas = useCallback(
    (cx, cy) => {
      const { dw, dh, scale, centerX, centerZ } = view;
      const vOffset = cy - PADDING - dh / 2;
      return {
        wh: centerX + (cx - PADDING - dw / 2) / scale,
        wv: invertZ ? centerZ + vOffset / scale : centerZ - vOffset / scale,
      };
    },
    [view, invertZ]
  );

  const getPoiAt = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const sx0 = clientX - rect.left;
      const sy0 = clientY - rect.top;
      // Test de survol en coordonnées ÉCRAN : le rayon de détection reste
      // constant (14px) quel que soit le zoom, comme la taille des marqueurs.
      let closest = null,
        minDist = 14;
      pois.forEach((poi) => {
        const base = toCanvas(
          Number(poi.coords[axisH]),
          Number(poi.coords[axisV])
        );
        const px = pan.x + base.cx * zoom;
        const py = pan.y + base.cy * zoom;
        const dist = Math.hypot(sx0 - px, sy0 - py);
        if (dist < minDist) {
          minDist = dist;
          closest = { poi, sx: sx0, sy: sy0 };
        }
      });
      return closest;
    },
    [pois, pan, zoom, toCanvas, axisH, axisV]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    canvas.style.width = MAP_SIZE + "px";
    canvas.style.height = MAP_SIZE + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Le zoom/pan n'est appliqué qu'aux POSITIONS, jamais aux tailles :
    // les marqueurs et le texte gardent une taille d'écran fixe, seul
    // l'espacement des points change → zoomer aère les zones denses.
    const project = (cx, cy) => ({
      x: pan.x + cx * zoom,
      y: pan.y + cy * zoom,
    });

    ctx.fillStyle = "#0D0F14";
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    const gc = 8;
    ctx.strokeStyle = "#1A2A3A";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gc; i++) {
      const g = PADDING + (i / gc) * (MAP_SIZE - PADDING * 2);
      const v1 = project(g, PADDING);
      const v2 = project(g, MAP_SIZE - PADDING);
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.stroke();
      const h1 = project(PADDING, g);
      const h2 = project(MAP_SIZE - PADDING, g);
      ctx.beginPath();
      ctx.moveTo(h1.x, h1.y);
      ctx.lineTo(h2.x, h2.y);
      ctx.stroke();
    }

    const orig = toCanvas(0, 0);
    ctx.strokeStyle = "#334455";
    ctx.lineWidth = 1;
    if (orig.cx >= PADDING && orig.cx <= MAP_SIZE - PADDING) {
      const a = project(orig.cx, PADDING);
      const b = project(orig.cx, MAP_SIZE - PADDING);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (orig.cy >= PADDING && orig.cy <= MAP_SIZE - PADDING) {
      const a = project(PADDING, orig.cy);
      const b = project(MAP_SIZE - PADDING, orig.cy);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Libellés d'axes : fixés dans un coin de l'écran (taille constante).
    ctx.fillStyle = "#00E5FF88";
    ctx.font = "bold 11px monospace";
    ctx.fillText(
      `${labelH} →`,
      MAP_SIZE - PADDING - 28,
      MAP_SIZE - PADDING + 18
    );
    ctx.fillText(`↑ ${labelV}`, PADDING - 20, PADDING - 8);

    // Graduations : suivent la grille projetée mais gardent une taille fixe.
    ctx.fillStyle = "#334455";
    ctx.font = "9px monospace";
    for (let i = 0; i <= gc; i++) {
      const frac = i / gc;
      const g = PADDING + frac * (MAP_SIZE - PADDING * 2);
      const { wh } = fromCanvas(g, PADDING);
      const { wv } = fromCanvas(PADDING, g);
      const bottom = project(g, MAP_SIZE - PADDING);
      const left = project(PADDING, g);
      ctx.fillText(Math.round(wh), bottom.x - 10, bottom.y + 14);
      ctx.fillText(Math.round(wv), left.x - 20, left.y + 3);
    }

    // Zones : dessinées SOUS les marqueurs. Polyligne (ouverte) ou
    // polygone rempli (fermée), + petits sommets. Tailles fixes (non zoomées).
    zones.forEach((zone) => {
      // On garde l'index d'origine (idx) pour numéroter comme la liste Zones.
      const pts = zone.points
        .map((pt, idx) => {
          const b = toCanvas(Number(pt.coords[axisH]), Number(pt.coords[axisV]));
          const p = project(b.cx, b.cy);
          return { x: p.x, y: p.y, idx };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (pts.length === 0) return;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (zone.closed && pts.length >= 3) {
          ctx.closePath();
          ctx.fillStyle = zone.color + "22";
          ctx.fill();
        }
        ctx.strokeStyle = zone.color + "CC";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = zone.color + "88";
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      // Numéros des sommets (option activable par zone), alignés sur la liste.
      if (zone.showIndices) {
        ctx.fillStyle = zone.color;
        ctx.font = "bold 10px monospace";
        pts.forEach((p) => ctx.fillText(`#${p.idx + 1}`, p.x + 5, p.y - 5));
      }
    });

    pois.forEach((poi) => {
      const cat =
        categories.find((c) => c.id === poi.category) ||
        categories[categories.length - 1];
      const base = toCanvas(
        Number(poi.coords[axisH]),
        Number(poi.coords[axisV])
      );
      const { x: cx, y: cy } = project(base.cx, base.cy);
      const isSel = poi.id === selectedId;
      const r = isSel ? 10 : 7;
      if (isSel) {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
        grd.addColorStop(0, cat.color + "66");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? cat.color : cat.color + "CC";
      ctx.fill();
      ctx.strokeStyle = isSel ? "#ffffff" : cat.color;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = "#E8F4FD";
      ctx.font = `${isSel ? "bold " : ""}11px monospace`;
      ctx.fillText(poi.name, cx + r + 4, cy + 4);
      // Show the "height" axis (the one not displayed on map)
      const heightIdx = [0, 1, 2].find((i) => i !== axisH && i !== axisV);
      const hVal = Number(poi.coords[heightIdx]);
      const hLabel = coordMode.axes[coordMode.order.indexOf(heightIdx)];
      if (!isNaN(hVal)) {
        ctx.fillStyle = "#00E5FF88";
        ctx.font = "9px monospace";
        ctx.fillText(`${hLabel}:${hVal.toFixed(0)}`, cx + r + 4, cy + 14);
      }
    });
  }, [
    pois,
    zones,
    selectedId,
    zoom,
    pan,
    bounds,
    toCanvas,
    fromCanvas,
    axisH,
    axisV,
    labelH,
    labelV,
    coordMode,
    invertZ,
    categories,
  ]);

  const handleMouseMove = (e) => {
    if (dragging.current) {
      setPan({
        x: dragStart.current.panX + e.clientX - dragStart.current.x,
        y: dragStart.current.panY + e.clientY - dragStart.current.y,
      });
      setTooltip(null);
      return;
    }
    const hit = getPoiAt(e.clientX, e.clientY);
    setTooltip(hit ? { x: hit.sx, y: hit.sy, poi: hit.poi } : null);
  };
  const handleMouseDown = (e) => {
    dragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };
  const handleMouseUp = (e) => {
    if (dragging.current) {
      const moved = Math.hypot(
        e.clientX - dragStart.current.x,
        e.clientY - dragStart.current.y
      );
      dragging.current = false;
      if (moved < 4) {
        const hit = getPoiAt(e.clientX, e.clientY);
        onSelect(hit ? (hit.poi.id === selectedId ? null : hit.poi.id) : null);
      }
    }
  };
  // Écouteurs natifs non-passifs : React attache onWheel/onTouchMove en mode
  // passif, ce qui empêche e.preventDefault() de bloquer le défilement de la
  // page (molette sur desktop, glissé du doigt sur mobile).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) =>
        Math.min(8, Math.max(0.3, z * (e.deltaY < 0 ? 1.12 : 0.89)))
      );
    };
    const onTouchMove = (e) => {
      // Empêche le défilement de la page pendant le pan de la carte.
      if (dragging.current) e.preventDefault();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragging.current = true;
      dragStart.current = {
        x: t.clientX,
        y: t.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      lastTouch.current = { x: t.clientX, y: t.clientY };
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && dragging.current) {
      const t = e.touches[0];
      setPan({
        x: dragStart.current.panX + t.clientX - dragStart.current.x,
        y: dragStart.current.panY + t.clientY - dragStart.current.y,
      });
    }
  };
  const handleTouchEnd = (e) => {
    if (dragging.current) {
      const t = e.changedTouches[0];
      const moved = lastTouch.current
        ? Math.hypot(
            t.clientX - lastTouch.current.x,
            t.clientY - lastTouch.current.y
          )
        : 99;
      dragging.current = false;
      if (moved < 6) {
        const hit = getPoiAt(t.clientX, t.clientY);
        onSelect(hit ? (hit.poi.id === selectedId ? null : hit.poi.id) : null);
      }
    }
  };

  const axisLabels = coordMode.axes;
  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 5,
          display: "flex",
          gap: 4,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
          style={{ ...btnStyle("#00E5FF"), padding: "2px 8px", fontSize: 15 }}
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
          style={{ ...btnStyle("#00E5FF"), padding: "2px 8px", fontSize: 15 }}
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          style={{ ...btnStyle("#778"), padding: "2px 8px", fontSize: 10 }}
        >
          ⟲
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          borderRadius: 6,
          cursor: "crosshair",
          touchAction: "none",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragging.current = false;
          setTooltip(null);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: "#1A1F2E",
            border: `1px solid ${
              (
                categories.find((c) => c.id === tooltip.poi.category) ||
                categories[categories.length - 1]
              ).color
            }88`,
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 12,
            color: "#E8F4FD",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 20,
          }}
        >
          <div style={{ fontWeight: 700 }}>{tooltip.poi.name}</div>
          <div style={{ color: "#39FF14", fontSize: 11 }}>
            {axisLabels[0]}:{Number(tooltip.poi.coords[0]).toFixed(1)}{" "}
            {axisLabels[1]}:{Number(tooltip.poi.coords[1]).toFixed(1)}{" "}
            {axisLabels[2]}:{Number(tooltip.poi.coords[2]).toFixed(1)}
          </div>
        </div>
      )}
      {pois.length === 0 && zones.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#334455",
            fontFamily: "monospace",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          Aucun POI à afficher
        </div>
      )}
    </div>
  );
}

/* ── POICard ───────────────────────────────────────────── */
function POICard({
  poi,
  onDelete,
  onEdit,
  isSelected,
  onSelect,
  coordMode,
  zones = [],
  onConvertToZone,
  categories,
}) {
  const cat =
    categories.find((c) => c.id === poi.category) ||
    categories[categories.length - 1];
  const isPredefined = poi.origin === "predefined";
  return (
    <div
      onClick={() => onSelect(poi.id === isSelected ? null : poi.id)}
      style={{
        background: isSelected ? "#1F2840" : "#1A1F2E",
        border: `1px solid ${isSelected ? cat.color : cat.color + "33"}`,
        borderLeft: `3px solid ${cat.color}`,
        borderRadius: 6,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: cat.color, fontSize: 18 }}>{cat.icon}</span>
        <span
          style={{
            color: "#E8F4FD",
            fontWeight: 700,
            fontSize: 15,
            flex: 1,
            fontFamily: "monospace",
          }}
        >
          {poi.name}
        </span>
        {isPredefined && (
          <span
            style={{
              color: "#66788A",
              fontSize: 10,
              fontFamily: "monospace",
              letterSpacing: 1,
              flexShrink: 0,
            }}
            title="Point prédéfini pour ce jeu"
          >
            🔒 PRÉDÉFINI
          </span>
        )}
        <span
          style={{
            background: `${cat.color}22`,
            color: cat.color,
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 10,
            fontFamily: "monospace",
            letterSpacing: 1,
          }}
        >
          {cat.label.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          background: "#0D0F14",
          borderRadius: 4,
          padding: "8px 10px",
          fontFamily: "monospace",
        }}
      >
        {coordMode.order.map((coordIdx, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ color: "#00E5FF", fontSize: 10, letterSpacing: 2 }}>
              {coordMode.axes[i]}
            </div>
            <div style={{ color: "#39FF14", fontSize: 14, fontWeight: 700 }}>
              {poi.coords[coordIdx] !== "" && poi.coords[coordIdx] !== undefined
                ? Number(poi.coords[coordIdx]).toFixed(1)
                : "—"}
            </div>
          </div>
        ))}
      </div>
      {poi.note && (
        <div
          style={{
            color: "#8899AA",
            fontSize: 13,
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {poi.note}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 2,
        }}
      >
        <span
          style={{ color: "#445566", fontSize: 11, fontFamily: "monospace" }}
        >
          {new Date(poi.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        <div
          style={{ display: "flex", gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          {zones.length > 0 && !isPredefined && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onConvertToZone(poi.id, Number(e.target.value));
              }}
              title="Convertir ce POI en point d'une zone"
              style={{
                background: "#0D0F14",
                border: "1px solid #2EC4B655",
                color: "#2EC4B6",
                fontFamily: "monospace",
                fontSize: 12,
                padding: "3px 6px",
                borderRadius: 4,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="" disabled>
                → zone…
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          {!isPredefined && (
            <>
              <button onClick={() => onEdit(poi)} style={btnStyle("#00E5FF")}>
                ✎
              </button>
              <button
                onClick={() => onDelete(poi.id)}
                style={btnStyle("#FF4444")}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ZonesView ─────────────────────────────────────────── */
function ZonesView({
  zones,
  coordMode,
  expandedZoneId,
  setExpandedZoneId,
  zonePointForm,
  setZonePointForm,
  onAddZone,
  onUpdateZone,
  onDeleteZone,
  onAddPoint,
  onDeletePoint,
  onMovePoint,
}) {
  const [newName, setNewName] = useState("");

  const toggleExpand = (id) => {
    setExpandedZoneId((cur) => (cur === id ? null : id));
    setZonePointForm(["", "", ""]);
  };

  const handleAddZone = () => {
    if (!newName.trim()) return;
    onAddZone(newName);
    setNewName("");
  };

  // Un point est ajoutable si les 3 coords sont des nombres valides.
  const pointReady = zonePointForm.every(
    (v) => v !== "" && v !== "-" && Number.isFinite(Number(v))
  );

  const label = { color: "#00E5FF", fontFamily: "monospace", fontSize: 11 };

  return (
    <div
      style={{
        marginTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Créer une zone */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddZone()}
          placeholder="Nom de la nouvelle zone…"
          style={{
            flex: 1,
            background: "#1A1F2E",
            border: "1px solid #334",
            color: "#C8D6E5",
            fontSize: 14,
            padding: "9px 14px",
            borderRadius: 6,
            outline: "none",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleAddZone}
          style={{
            ...btnStyle("#00E5FF"),
            background: "#00E5FF22",
            fontSize: 13,
            padding: "0 14px",
          }}
        >
          ＋ Zone
        </button>
      </div>

      {zones.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#334",
            fontFamily: "monospace",
            padding: "40px 20px",
            border: "1px dashed #223",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>⬠</div>
          <div>Aucune zone.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Créez-en une pour délimiter une aire de la carte.
          </div>
        </div>
      ) : (
        zones.map((zone) => {
          const expanded = expandedZoneId === zone.id;
          return (
            <div
              key={zone.id}
              style={{
                background: "#1A1F2E",
                border: `1px solid ${zone.color}33`,
                borderLeft: `3px solid ${zone.color}`,
                borderRadius: 6,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* En-tête de zone */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: zone.color,
                    flexShrink: 0,
                  }}
                />
                <input
                  value={zone.name}
                  onChange={(e) =>
                    onUpdateZone(zone.id, { name: e.target.value })
                  }
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid transparent",
                    color: "#E8F4FD",
                    fontWeight: 700,
                    fontSize: 15,
                    fontFamily: "monospace",
                    outline: "none",
                    padding: "2px 0",
                  }}
                />
                <span
                  style={{
                    color: "#66788A",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  {zone.points.length} pt
                </span>
                <button
                  onClick={() =>
                    onUpdateZone(zone.id, { closed: !zone.closed })
                  }
                  title="Zone fermée (remplie) / ouverte (ligne)"
                  style={{
                    ...btnStyle(zone.closed ? zone.color : "#66788A"),
                    background: zone.closed ? `${zone.color}22` : "transparent",
                    fontSize: 11,
                  }}
                >
                  {zone.closed ? "▣ Fermée" : "▢ Ouverte"}
                </button>
                <button
                  onClick={() =>
                    onUpdateZone(zone.id, { showIndices: !zone.showIndices })
                  }
                  title="Afficher les numéros des points sur la carte"
                  style={{
                    ...btnStyle(zone.showIndices ? zone.color : "#66788A"),
                    background: zone.showIndices
                      ? `${zone.color}22`
                      : "transparent",
                    fontSize: 11,
                  }}
                >
                  {zone.showIndices ? "☑" : "☐"} N°
                </button>
                <button
                  onClick={() => toggleExpand(zone.id)}
                  style={btnStyle("#00E5FF")}
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <button
                  onClick={() => onDeleteZone(zone.id)}
                  style={btnStyle("#FF4444")}
                >
                  ✕
                </button>
              </div>

              {expanded && (
                <>
                  {/* Sélecteur de couleur */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ZONE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => onUpdateZone(zone.id, { color: c })}
                        title={c}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: c,
                          border:
                            zone.color === c
                              ? "2px solid #E8F4FD"
                              : "2px solid transparent",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>

                  {/* Ajout d'un point */}
                  <div
                    style={{
                      background: "#0D0F14",
                      borderRadius: 6,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 10,
                      }}
                    >
                      {coordMode.order.map((coordIdx, i) => (
                        <CoordInput
                          key={i}
                          label={coordMode.axes[i]}
                          value={zonePointForm[coordIdx]}
                          onChange={(v) =>
                            setZonePointForm((f) => {
                              const c = [...f];
                              c[coordIdx] = v;
                              return c;
                            })
                          }
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        onAddPoint(zone.id, zonePointForm);
                        setZonePointForm(["", "", ""]);
                      }}
                      disabled={!pointReady}
                      style={{
                        ...btnStyle(pointReady ? "#39FF14" : "#334"),
                        background: pointReady ? "#39FF1422" : "transparent",
                        cursor: pointReady ? "pointer" : "not-allowed",
                        fontSize: 12,
                        padding: "7px 0",
                      }}
                    >
                      ＋ Ajouter le point
                    </button>
                  </div>

                  {/* Liste des points */}
                  {zone.points.length === 0 ? (
                    <div
                      style={{
                        color: "#445566",
                        fontFamily: "monospace",
                        fontSize: 12,
                        textAlign: "center",
                        padding: "6px 0",
                      }}
                    >
                      Aucun point — ajoutez-en pour tracer la zone.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {zone.points.map((pt, idx) => (
                        <div
                          key={pt.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#0D0F14",
                            borderRadius: 4,
                            padding: "6px 10px",
                          }}
                        >
                          <span style={{ ...label, color: "#66788A" }}>
                            #{idx + 1}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              color: "#39FF14",
                              fontFamily: "monospace",
                              fontSize: 13,
                            }}
                          >
                            {coordMode.order
                              .map(
                                (coordIdx, i) =>
                                  `${coordMode.axes[i]}:${Number(
                                    pt.coords[coordIdx]
                                  ).toFixed(1)}`
                              )
                              .join("  ")}
                          </span>
                          <button
                            onClick={() => onMovePoint(zone.id, idx, -1)}
                            disabled={idx === 0}
                            style={{
                              ...btnStyle(idx === 0 ? "#334" : "#00E5FF"),
                              cursor: idx === 0 ? "not-allowed" : "pointer",
                              padding: "2px 8px",
                            }}
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => onMovePoint(zone.id, idx, 1)}
                            disabled={idx === zone.points.length - 1}
                            style={{
                              ...btnStyle(
                                idx === zone.points.length - 1
                                  ? "#334"
                                  : "#00E5FF"
                              ),
                              cursor:
                                idx === zone.points.length - 1
                                  ? "not-allowed"
                                  : "pointer",
                              padding: "2px 8px",
                            }}
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => onDeletePoint(zone.id, pt.id)}
                            style={{ ...btnStyle("#FF4444"), padding: "2px 8px" }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ── App ───────────────────────────────────────────────── */
const DEFAULT_POIS = [
  {
    id: 1,
    name: "Coffre caché",
    category: "treasure",
    coords: [142.5, -38.0, 77.2],
    note: "Derrière la cascade au nord du village.",
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 2,
    name: "Boss optionnel",
    category: "enemy",
    coords: [-503.0, 12.0, 210.8],
    note: "Apparaît uniquement la nuit.",
    createdAt: Date.now() - 86400000,
  },
  {
    id: 3,
    name: "PNJ marchand",
    category: "npc",
    coords: [80.0, 0.0, -150.0],
    note: "Vend des potions rares.",
    createdAt: Date.now() - 3600000,
  },
];

// Migration ponctuelle des données v1 -> v2, exécutée une fois au chargement
// du module (avant le premier rendu de App).
migrateLegacyStateIfNeeded();

const dist3D = (a, b) =>
  Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]), Number(a[2]) - Number(b[2]));

export default function App() {
  const [gameId, setGameIdRaw] = useState(() => loadActiveGameId() ?? DEFAULT_GAME_ID);
  const game = getGame(gameId);
  // N'est lu qu'à l'initialisation : les changements de jeu ultérieurs
  // passent par handleGameChange, qui recharge explicitement chaque état.
  const [saved] = useState(() => loadGameState(gameId));

  const [pois, setPois] = useState(
    () => saved?.pois ?? (gameId === DEFAULT_GAME_ID ? DEFAULT_POIS : [])
  );
  const [discoveredPredefinedIds, setDiscoveredPredefinedIds] = useState(
    () => saved?.discoveredPredefinedIds ?? []
  );
  const [coordMode, setCoordModeRaw] = useState(
    () => COORD_MODES.find((m) => m.id === saved?.coordMode) ?? COORD_MODES[0]
  );
  const [invertZ, setInvertZ] = useState(() => saved?.invertZ ?? false);
  const [zones, setZones] = useState(saved?.zones ?? []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("list");
  const [importErr, setImportErr] = useState(null);
  // Résultat de la dernière recherche explicite de POI prédéfini proche
  // (voir handleSearchNearby) : { id, name, distance } ou { notFound: true }.
  const [discoveryResult, setDiscoveryResult] = useState(null);
  // Panneau d'options actuellement ouvert (null = tout masqué).
  const [activePanel, setActivePanel] = useState(null);
  // Zone dont l'éditeur de points est déplié, et saisie de point en cours.
  const [expandedZoneId, setExpandedZoneId] = useState(null);
  const [zonePointForm, setZonePointForm] = useState(["", "", ""]);
  const importRef = useRef(null);

  // Compteur d'id monotone (zones + points) — évite les collisions de Date.now().
  const idRef = useRef(Date.now());
  const genId = () => ++idRef.current;

  const togglePanel = (id, e) => {
    // On enlève le focus pour éviter tout contour résiduel du navigateur
    // qui pourrait faire croire qu'un bouton reste actif.
    e?.currentTarget?.blur();
    setActivePanel((cur) => (cur === id ? null : id));
  };

  // Bouton icône de la barre compacte : état actif nettement contrasté,
  // état inactif discret (bordure transparente, texte grisé).
  const iconBtn = (active, color = "#00E5FF") => ({
    background: active ? `${color}33` : "transparent",
    border: `1px solid ${active ? color : "transparent"}`,
    color: active ? color : "#66788A",
    borderRadius: 4,
    padding: "6px 10px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: 16,
    lineHeight: 1,
    position: "relative",
    outline: "none",
  });

  // Persist on every change (dans le stockage du jeu actif uniquement)
  useEffect(() => {
    saveGameState(gameId, pois, coordMode.id, invertZ, zones, discoveredPredefinedIds);
  }, [gameId, pois, coordMode, invertZ, zones, discoveredPredefinedIds]);

  // Bascule vers un autre jeu : sauvegarde implicite déjà faite par l'effet
  // ci-dessus, il suffit de recharger l'état propre au nouveau jeu.
  const handleGameChange = (newGameId) => {
    if (newGameId === gameId || !GAMES[newGameId]) return;
    const next = loadGameState(newGameId);
    setGameIdRaw(newGameId);
    saveActiveGameId(newGameId);
    setPois(next?.pois ?? (newGameId === DEFAULT_GAME_ID ? DEFAULT_POIS : []));
    setCoordModeRaw(
      COORD_MODES.find((m) => m.id === next?.coordMode) ?? COORD_MODES[0]
    );
    setInvertZ(next?.invertZ ?? false);
    setZones(next?.zones ?? []);
    setDiscoveredPredefinedIds(next?.discoveredPredefinedIds ?? []);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
    setFilterCat("all");
    setDiscoveryResult(null);
  };

  const setCoordMode = (mode) => setCoordModeRaw(mode);

  // Liste affichée : POI personnalisés + POI prédéfinis du jeu actif
  // (toujours-visibles ou déjà découverts). Pas de duplication en storage —
  // les prédéfinis découverts ne sont référencés que par leur id.
  const visiblePois = useMemo(() => {
    const predefined = game.predefinedPois
      .filter((p) => p.alwaysVisible || discoveredPredefinedIds.includes(p.id))
      .map((p) => ({
        id: `predefined:${p.id}`,
        name: p.name,
        category: p.category,
        coords: p.coords,
        note: "",
        createdAt: 0,
        origin: "predefined",
        predefinedId: p.id,
      }));
    return [
      ...pois.map((p) => ({ ...p, origin: "custom" })),
      ...predefined,
    ];
  }, [pois, game, discoveredPredefinedIds]);

  // Recherche explicite (jamais automatique) du POI prédéfini non-découvert
  // le plus proche des coordonnées actuellement saisies dans le formulaire.
  const discoverableCandidates = game.predefinedPois.filter(
    (p) => !p.alwaysVisible && !discoveredPredefinedIds.includes(p.id)
  );

  const handleSearchNearby = () => {
    const coords = form.coords.map((v) => Number(v));
    if (coords.some((n) => Number.isNaN(n))) {
      setDiscoveryResult({ error: "Saisis des coordonnées valides d'abord." });
      return;
    }
    if (discoverableCandidates.length === 0) {
      setDiscoveryResult({ notFound: true });
      return;
    }
    let best = null;
    let bestDist = Infinity;
    discoverableCandidates.forEach((p) => {
      const d = dist3D(coords, p.coords);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    });
    setDiscoveryResult({ id: best.id, name: best.name, distance: bestDist });
  };

  const confirmDiscovery = () => {
    if (!discoveryResult?.id) return;
    setDiscoveredPredefinedIds((ids) => [...ids, discoveryResult.id]);
    setDiscoveryResult(null);
  };

  const filtered = useMemo(() => {
    let list = visiblePois.filter((p) => {
      const matchCat = filterCat === "all" || p.category === filterCat;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.note || "").toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
    if (sort === "date_desc")
      list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "date_asc")
      list = [...list].sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === "name_asc")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "cat")
      list = [...list].sort((a, b) => a.category.localeCompare(b.category));
    return list;
  }, [visiblePois, filterCat, search, sort]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editId !== null) {
      setPois((p) =>
        p.map((poi) => (poi.id === editId ? { ...poi, ...form } : poi))
      );
      setEditId(null);
    } else {
      setPois((p) => [
        ...p,
        { ...form, id: Date.now(), createdAt: Date.now() },
      ]);
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const handleEdit = (poi) => {
    if (poi.origin === "predefined") return; // non éditable, vient de la config du jeu
    setForm({
      name: poi.name,
      category: poi.category,
      coords: [...poi.coords.map(String)],
      note: poi.note || "",
    });
    setEditId(poi.id);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (typeof id === "string" && id.startsWith("predefined:")) return;
    setPois((p) => p.filter((poi) => poi.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
  };

  /* ── Zones ── */
  const addZone = (name) => {
    const n = name.trim();
    if (!n) return;
    setZones((zs) => [
      ...zs,
      {
        id: genId(),
        name: n,
        color: ZONE_COLORS[zs.length % ZONE_COLORS.length],
        closed: true,
        showIndices: false,
        points: [],
        createdAt: Date.now(),
      },
    ]);
  };

  const updateZone = (id, patch) =>
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));

  const deleteZone = (id) => {
    setZones((zs) => zs.filter((z) => z.id !== id));
    if (expandedZoneId === id) setExpandedZoneId(null);
  };

  const addPointToZone = (zoneId, formCoords) => {
    // formCoords : strings déjà en ordre [X, Y, Z] (le formulaire a mappé
    // coordMode.order), on ne re-mappe pas — juste coercition numérique.
    const coords = formCoords.map((v) => Number(v));
    setZones((zs) =>
      zs.map((z) =>
        z.id === zoneId
          ? { ...z, points: [...z.points, { id: genId(), coords }] }
          : z
      )
    );
  };

  const deletePoint = (zoneId, pointId) =>
    setZones((zs) =>
      zs.map((z) =>
        z.id === zoneId
          ? { ...z, points: z.points.filter((p) => p.id !== pointId) }
          : z
      )
    );

  const movePoint = (zoneId, index, dir) =>
    setZones((zs) =>
      zs.map((z) => {
        if (z.id !== zoneId) return z;
        const j = index + dir;
        if (j < 0 || j >= z.points.length) return z;
        const pts = [...z.points];
        [pts[index], pts[j]] = [pts[j], pts[index]];
        return { ...z, points: pts };
      })
    );

  const convertPoiToZonePoint = (poiId, zoneId) => {
    if (typeof poiId === "string" && poiId.startsWith("predefined:")) return;
    const poi = pois.find((p) => p.id === poiId);
    if (!poi) return;
    setZones((zs) =>
      zs.map((z) =>
        z.id === zoneId
          ? {
              ...z,
              points: [
                ...z.points,
                { id: genId(), coords: [...poi.coords].map(Number) },
              ],
            }
          : z
      )
    );
    handleDelete(poiId);
  };

  /* ── Export JSON ── */
  const handleExport = () => {
    const data = JSON.stringify(
      {
        schemaVersion: 2,
        gameId,
        coordMode: coordMode.id,
        zones,
        pois,
        discoveredPredefinedIds,
      },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poi-export-${gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Import JSON ── */
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.pois)) throw new Error("Format invalide");
        const importGameId =
          parsed.gameId && GAMES[parsed.gameId] ? parsed.gameId : gameId;

        if (importGameId === gameId) {
          // Même jeu actif : fusion directe dans l'état courant.
          const existingIds = new Set(pois.map((p) => p.id));
          const newPois = parsed.pois.filter((p) => !existingIds.has(p.id));
          setPois((prev) => [...prev, ...newPois]);
          let newZonesCount = 0;
          if (Array.isArray(parsed.zones)) {
            const existingZoneIds = new Set(zones.map((z) => z.id));
            const newZones = parsed.zones.filter(
              (z) => !existingZoneIds.has(z.id)
            );
            newZonesCount = newZones.length;
            if (newZones.length) setZones((prev) => [...prev, ...newZones]);
          }
          if (Array.isArray(parsed.discoveredPredefinedIds)) {
            setDiscoveredPredefinedIds((prev) =>
              Array.from(new Set([...prev, ...parsed.discoveredPredefinedIds]))
            );
          }
          if (parsed.coordMode)
            setCoordModeRaw(
              COORD_MODES.find((m) => m.id === parsed.coordMode) ?? coordMode
            );
          const zoneMsg =
            newZonesCount > 0 ? ` + ${newZonesCount} zone(s)` : "";
          setImportErr(
            newPois.length === 0 && newZonesCount === 0
              ? "Aucun nouveau POI importé (tous déjà présents)."
              : `${newPois.length} POI(s)${zoneMsg} importé(s) avec succès !`
          );
        } else {
          // Le fichier appartient à un autre jeu : un seul jeu actif à la
          // fois (cf. plan), donc on fusionne dans SON stockage puis on
          // bascule dessus plutôt que de mélanger deux mondes différents.
          const target = loadGameState(importGameId) ?? {};
          const existingIds = new Set((target.pois ?? []).map((p) => p.id));
          const newPois = parsed.pois.filter((p) => !existingIds.has(p.id));
          const mergedPois = [...(target.pois ?? []), ...newPois];
          const existingZoneIds = new Set(
            (target.zones ?? []).map((z) => z.id)
          );
          const newZones = Array.isArray(parsed.zones)
            ? parsed.zones.filter((z) => !existingZoneIds.has(z.id))
            : [];
          const mergedZones = [...(target.zones ?? []), ...newZones];
          const mergedDiscovered = Array.from(
            new Set([
              ...(target.discoveredPredefinedIds ?? []),
              ...(parsed.discoveredPredefinedIds ?? []),
            ])
          );
          saveGameState(
            importGameId,
            mergedPois,
            parsed.coordMode ?? target.coordMode,
            target.invertZ ?? false,
            mergedZones,
            mergedDiscovered
          );
          handleGameChange(importGameId);
          setImportErr(
            `Import vers "${getGame(importGameId).name}" : ${newPois.length} POI(s) + ${newZones.length} zone(s). Jeu actif changé.`
          );
        }
      } catch (err) {
        setImportErr("Erreur : fichier JSON invalide.");
      }
      e.target.value = "";
      setTimeout(() => setImportErr(null), 4000);
    };
    reader.readAsText(file);
  };

  const selPoi = visiblePois.find((p) => p.id === selectedId);
  const selCat = selPoi ? findCategory(game, selPoi.category) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D0F14",
        color: "#C8D6E5",
        fontFamily: "sans-serif",
        paddingBottom: 60,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#0D0F14",
          borderBottom: "1px solid #00E5FF22",
          padding: "18px 20px 14px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 600,
            margin: "0 auto",
          }}
        >
          <div>
            <div
              style={{
                color: "#00E5FF",
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: 3,
                marginBottom: 2,
              }}
            >
              ◈ WAYPOINT SYSTEM
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#E8F4FD",
                letterSpacing: 1,
              }}
            >
              Points d'Intérêt
            </h1>
            {/* Sélecteur de jeu : discret, ne sert qu'à démarrer une carte
                vierge ou basculer explicitement de jeu (cf. plan §3). */}
            <select
              value={gameId}
              onChange={(e) => handleGameChange(e.target.value)}
              title="Changer de jeu"
              style={{
                marginTop: 4,
                background: "transparent",
                border: "none",
                color: "#66788A",
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
                outline: "none",
                padding: 0,
              }}
            >
              {GAME_LIST.map((g) => (
                <option key={g.id} value={g.id} style={{ background: "#0D0F14" }}>
                  🎮 {g.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setShowForm((s) => !s);
              if (showForm) handleCancel();
            }}
            style={{
              background: showForm ? "#FF444422" : "#00E5FF22",
              border: `1px solid ${showForm ? "#FF4444" : "#00E5FF"}`,
              color: showForm ? "#FF4444" : "#00E5FF",
              fontFamily: "monospace",
              fontSize: 13,
              padding: "8px 18px",
              borderRadius: 6,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            {showForm ? "✕ Annuler" : "+ NOUVEAU"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>
        {/* Notification import */}
        {importErr && (
          <div
            style={{
              marginTop: 12,
              background: importErr.startsWith("Erreur")
                ? "#FF444422"
                : "#39FF1422",
              border: `1px solid ${
                importErr.startsWith("Erreur") ? "#FF4444" : "#39FF14"
              }`,
              color: importErr.startsWith("Erreur") ? "#FF4444" : "#39FF14",
              borderRadius: 6,
              padding: "8px 14px",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {importErr}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div
            style={{
              background: "#1A1F2E",
              border: "1px solid #00E5FF44",
              borderRadius: 8,
              padding: "20px",
              marginTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                color: "#00E5FF",
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: 2,
              }}
            >
              {editId ? "◈ MODIFIER LE POI" : "◈ NOUVEAU POI"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  color: "#00E5FF",
                  fontSize: 10,
                  fontFamily: "monospace",
                  letterSpacing: 2,
                }}
              >
                NOM
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Ex: Coffre secret du donjon..."
                style={{
                  background: "#0D0F14",
                  border: "1px solid #00E5FF33",
                  color: "#E8F4FD",
                  fontSize: 15,
                  padding: "9px 12px",
                  borderRadius: 4,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
            </div>
            <div>
              <div
                style={{
                  color: "#00E5FF",
                  fontSize: 10,
                  fontFamily: "monospace",
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                COORDONNÉES 3D{" "}
                <span style={{ color: "#445", fontWeight: 400 }}>
                  ({coordMode.label})
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                {coordMode.order.map((coordIdx, i) => (
                  <CoordInput
                    key={i}
                    label={coordMode.axes[i]}
                    value={form.coords[coordIdx]}
                    onChange={(v) =>
                      setForm((f) => {
                        const c = [...f.coords];
                        c[coordIdx] = v;
                        return { ...f, coords: c };
                      })
                    }
                  />
                ))}
              </div>
              {discoverableCandidates.length > 0 && editId === null && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={handleSearchNearby}
                    style={btnStyle("#FFD700")}
                  >
                    🔍 Chercher un point connu à proximité
                  </button>
                  {discoveryResult?.error && (
                    <div
                      style={{
                        marginTop: 6,
                        color: "#FF4444",
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      {discoveryResult.error}
                    </div>
                  )}
                  {discoveryResult?.notFound && (
                    <div
                      style={{
                        marginTop: 6,
                        color: "#8899AA",
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      Plus aucun point connu à découvrir pour ce jeu.
                    </div>
                  )}
                  {discoveryResult?.id && (
                    <div
                      style={{
                        marginTop: 8,
                        background: "#0D0F14",
                        border: "1px solid #FFD70055",
                        borderRadius: 6,
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          color: "#FFD700",
                          fontSize: 13,
                          fontFamily: "monospace",
                        }}
                      >
                        Point trouvé à proximité : <b>{discoveryResult.name}</b>
                        {" "}(à {discoveryResult.distance.toFixed(0)} unités) —
                        le découvrir ?
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={confirmDiscovery}
                          style={btnStyle("#39FF14")}
                        >
                          ✔ Découvrir
                        </button>
                        <button
                          onClick={() => setDiscoveryResult(null)}
                          style={btnStyle("#8899AA")}
                        >
                          Ignorer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <div
                style={{
                  color: "#00E5FF",
                  fontSize: 10,
                  fontFamily: "monospace",
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                CATÉGORIE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {game.categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setForm((f) => ({ ...f, category: cat.id }))}
                    style={{
                      background:
                        form.category === cat.id
                          ? `${cat.color}33`
                          : "transparent",
                      border: `1px solid ${
                        form.category === cat.id ? cat.color : "#334"
                      }`,
                      color: form.category === cat.id ? cat.color : "#778",
                      fontFamily: "monospace",
                      fontSize: 12,
                      padding: "5px 12px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  color: "#00E5FF",
                  fontSize: 10,
                  fontFamily: "monospace",
                  letterSpacing: 2,
                }}
              >
                NOTE (optionnel)
              </label>
              <textarea
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="Détails, conditions, indices..."
                rows={2}
                style={{
                  background: "#0D0F14",
                  border: "1px solid #00E5FF33",
                  color: "#C8D6E5",
                  fontSize: 13,
                  padding: "9px 12px",
                  borderRadius: 4,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "sans-serif",
                }}
              />
            </div>
            <button
              onClick={handleSubmit}
              style={{
                background: "#00E5FF22",
                border: "1px solid #00E5FF",
                color: "#00E5FF",
                fontFamily: "monospace",
                fontSize: 14,
                padding: "10px",
                borderRadius: 6,
                cursor: "pointer",
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              {editId ? "✔ METTRE À JOUR" : "✔ ENREGISTRER"}
            </button>
          </div>
        )}

        {/* Compact toolbar: view toggle + icon buttons */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {/* View toggle (toujours visible) */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setView("list")}
              title="Vue liste"
              style={{
                ...iconBtn(view === "list"),
                fontSize: 14,
              }}
            >
              ☰
            </button>
            <button
              onClick={() => setView("map")}
              title="Vue carte"
              style={{
                ...iconBtn(view === "map"),
                fontSize: 14,
              }}
            >
              ⊕
            </button>
            <button
              onClick={() => setView("zones")}
              title="Vue zones"
              style={{
                ...iconBtn(view === "zones"),
                fontSize: 14,
              }}
            >
              ⬠
            </button>
          </div>

          {/* Icon buttons (ouvrent leur panneau) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button
              onClick={(e) => togglePanel("search", e)}
              title="Rechercher"
              style={iconBtn(activePanel === "search")}
            >
              🔍
              {search && activePanel !== "search" && <ActiveDot />}
            </button>
            <button
              onClick={(e) => togglePanel("filters", e)}
              title="Filtres & tri"
              style={iconBtn(activePanel === "filters")}
            >
              ⚑
              {filterCat !== "all" && activePanel !== "filters" && <ActiveDot />}
            </button>
            <button
              onClick={(e) => togglePanel("axes", e)}
              title="Axes & affichage"
              style={iconBtn(activePanel === "axes", "#FFD700")}
            >
              ⚙
            </button>
            <button
              onClick={(e) => togglePanel("data", e)}
              title="Import / Export JSON"
              style={iconBtn(activePanel === "data", "#AA88FF")}
            >
              ⇅
            </button>
          </div>
        </div>

        {/* Panneau : recherche */}
        {activePanel === "search" && (
          <div style={PANEL_STYLE}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍  Rechercher un POI..."
              style={{
                background: "#0D0F14",
                border: "1px solid #334",
                color: "#C8D6E5",
                fontSize: 14,
                padding: "9px 14px",
                borderRadius: 6,
                outline: "none",
                fontFamily: "monospace",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Panneau : filtres catégorie + tri */}
        {activePanel === "filters" && (
          <div
            style={{ ...PANEL_STYLE, flexDirection: "column", gap: 12 }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => setFilterCat("all")}
                style={{
                  ...btnStyle(filterCat === "all" ? "#00E5FF" : "#445"),
                  background: filterCat === "all" ? "#00E5FF22" : "transparent",
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                TOUS ({visiblePois.length})
              </button>
              {game.categories.map((cat) => {
                const count = visiblePois.filter(
                  (p) => p.category === cat.id
                ).length;
                if (!count) return null;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCat(cat.id)}
                    style={{
                      ...btnStyle(filterCat === cat.id ? cat.color : "#445"),
                      background:
                        filterCat === cat.id ? `${cat.color}22` : "transparent",
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {cat.icon} {count}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{ color: "#445", fontFamily: "monospace", fontSize: 11 }}
              >
                TRI :
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{
                  background: "#0D0F14",
                  border: "1px solid #334",
                  color: "#889",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 4,
                  outline: "none",
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Panneau : axes & affichage */}
        {activePanel === "axes" && (
          <div style={{ ...PANEL_STYLE, alignItems: "center" }}>
            <span
              style={{ color: "#445", fontFamily: "monospace", fontSize: 11 }}
            >
              AXES :
            </span>
            {COORD_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setCoordMode(m)}
                style={{
                  ...btnStyle(coordMode.id === m.id ? "#FFD700" : "#445"),
                  background:
                    coordMode.id === m.id ? "#FFD70022" : "transparent",
                  fontSize: 11,
                  padding: "3px 9px",
                }}
              >
                {m.label}
              </button>
            ))}
            <button
              onClick={() => setInvertZ((v) => !v)}
              title="Inverser l'axe Z sur la carte"
              style={{
                ...btnStyle(invertZ ? "#FFD700" : "#445"),
                background: invertZ ? "#FFD70022" : "transparent",
                fontSize: 11,
                padding: "3px 9px",
              }}
            >
              ↕ Z
            </button>
          </div>
        )}

        {/* Panneau : import / export */}
        {activePanel === "data" && (
          <div style={{ ...PANEL_STYLE, gap: 8 }}>
            <button
              onClick={handleExport}
              style={{
                ...btnStyle("#AA88FF"),
                flex: 1,
                fontSize: 12,
                padding: "7px 0",
              }}
            >
              ↓ Exporter JSON
            </button>
            <button
              onClick={() => importRef.current?.click()}
              style={{
                ...btnStyle("#39FF14"),
                flex: 1,
                fontSize: 12,
                padding: "7px 0",
              }}
            >
              ↑ Importer JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </div>
        )}

        {/* Map view */}
        {view === "map" && (
          <div
            style={{
              marginTop: 16,
              background: "#1A1F2E",
              borderRadius: 8,
              border: "1px solid #00E5FF22",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid #00E5FF11",
                fontFamily: "monospace",
                fontSize: 10,
                color: "#445",
                letterSpacing: 1,
              }}
            >
              CARTE {coordMode.axes[coordMode.order.indexOf(coordMode.mapH)]}/
              {coordMode.axes[coordMode.order.indexOf(coordMode.mapV)]} ·
              Scroll=zoom · Glisser=pan · Tap=sélect
            </div>
            <MapView
              pois={filtered}
              zones={zones}
              selectedId={selectedId}
              onSelect={setSelectedId}
              coordMode={coordMode}
              invertZ={invertZ}
              categories={game.categories}
            />
            {selPoi && (
              <div
                style={{
                  padding: "10px 14px",
                  borderTop: "1px solid #00E5FF11",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: selCat.color, fontSize: 16 }}>
                  {selCat.icon}
                </span>
                <span
                  style={{
                    color: "#E8F4FD",
                    fontFamily: "monospace",
                    fontWeight: 700,
                    flex: 1,
                  }}
                >
                  {selPoi.name}
                </span>
                <span
                  style={{
                    color: "#39FF14",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {coordMode.axes[0]}:
                  {Number(selPoi.coords[coordMode.order[0]]).toFixed(1)}{" "}
                  {coordMode.axes[1]}:
                  {Number(selPoi.coords[coordMode.order[1]]).toFixed(1)}{" "}
                  {coordMode.axes[2]}:
                  {Number(selPoi.coords[coordMode.order[2]]).toFixed(1)}
                </span>
                <button
                  onClick={() => handleEdit(selPoi)}
                  style={btnStyle("#00E5FF")}
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    handleDelete(selPoi.id);
                    setSelectedId(null);
                  }}
                  style={btnStyle("#FF4444")}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#334",
                  fontFamily: "monospace",
                  padding: "40px 20px",
                  border: "1px dashed #223",
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>◈</div>
                <div>Aucun point d'intérêt trouvé.</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Ajoutez-en un avec le bouton + NOUVEAU
                </div>
              </div>
            ) : (
              filtered.map((poi) => (
                <POICard
                  key={poi.id}
                  poi={poi}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  isSelected={poi.id === selectedId}
                  onSelect={setSelectedId}
                  coordMode={coordMode}
                  zones={zones}
                  onConvertToZone={convertPoiToZonePoint}
                  categories={game.categories}
                />
              ))
            )}
          </div>
        )}

        {/* Zones view */}
        {view === "zones" && (
          <ZonesView
            zones={zones}
            coordMode={coordMode}
            expandedZoneId={expandedZoneId}
            setExpandedZoneId={setExpandedZoneId}
            zonePointForm={zonePointForm}
            setZonePointForm={setZonePointForm}
            onAddZone={addZone}
            onUpdateZone={updateZone}
            onDeleteZone={deleteZone}
            onAddPoint={addPointToZone}
            onDeletePoint={deletePoint}
            onMovePoint={movePoint}
          />
        )}
      </div>
    </div>
  );
}
