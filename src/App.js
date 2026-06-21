import { useState, useMemo, useRef, useEffect, useCallback } from "react";

const CATEGORIES = [
  { id: "treasure", label: "Trésor", icon: "◈", color: "#FFD700" },
  { id: "enemy", label: "Ennemi", icon: "⚠", color: "#FF4444" },
  { id: "npc", label: "PNJ", icon: "◉", color: "#AA88FF" },
  { id: "secret", label: "Secret", icon: "✦", color: "#00E5FF" },
  { id: "spawn", label: "Spawn", icon: "⟳", color: "#39FF14" },
  { id: "other", label: "Autre", icon: "◆", color: "#C8D6E5" },
];

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

const STORAGE_KEY = "poi-tracker-v1";

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

/* ── localStorage helpers ──────────────────────────────── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(pois, coordMode, invertZ) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pois, coordMode, invertZ })
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

function MapView({ pois, selectedId, onSelect, coordMode, invertZ }) {
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
    if (!pois.length) return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    const hs = pois.map((p) => Number(p.coords[axisH]));
    const vs = pois.map((p) => Number(p.coords[axisV]));
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
  }, [pois, axisH, axisV]);

  const toCanvas = useCallback(
    (wh, wv) => {
      const dw = MAP_SIZE - PADDING * 2,
        dh = MAP_SIZE - PADDING * 2;
      const fracV = (wv - bounds.minZ) / (bounds.maxZ - bounds.minZ);
      return {
        cx: PADDING + ((wh - bounds.minX) / (bounds.maxX - bounds.minX)) * dw,
        cy: PADDING + (invertZ ? fracV : 1 - fracV) * dh,
      };
    },
    [bounds, invertZ]
  );

  const getPoiAt = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const lx = (clientX - rect.left - pan.x) / zoom;
      const ly = (clientY - rect.top - pan.y) / zoom;
      let closest = null,
        minDist = 14;
      pois.forEach((poi) => {
        const { cx, cy } = toCanvas(
          Number(poi.coords[axisH]),
          Number(poi.coords[axisV])
        );
        const dist = Math.hypot(lx - cx, ly - cy);
        if (dist < minDist) {
          minDist = dist;
          closest = { poi, sx: clientX - rect.left, sy: clientY - rect.top };
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
    ctx.scale(dpr, dpr);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    ctx.fillStyle = "#0D0F14";
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    const gc = 8;
    ctx.strokeStyle = "#1A2A3A";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gc; i++) {
      const x = PADDING + (i / gc) * (MAP_SIZE - PADDING * 2);
      const y = PADDING + (i / gc) * (MAP_SIZE - PADDING * 2);
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, MAP_SIZE - PADDING);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(MAP_SIZE - PADDING, y);
      ctx.stroke();
    }

    const orig = toCanvas(0, 0);
    ctx.strokeStyle = "#334455";
    ctx.lineWidth = 1;
    if (orig.cx >= PADDING && orig.cx <= MAP_SIZE - PADDING) {
      ctx.beginPath();
      ctx.moveTo(orig.cx, PADDING);
      ctx.lineTo(orig.cx, MAP_SIZE - PADDING);
      ctx.stroke();
    }
    if (orig.cy >= PADDING && orig.cy <= MAP_SIZE - PADDING) {
      ctx.beginPath();
      ctx.moveTo(PADDING, orig.cy);
      ctx.lineTo(MAP_SIZE - PADDING, orig.cy);
      ctx.stroke();
    }

    ctx.fillStyle = "#00E5FF88";
    ctx.font = "bold 11px monospace";
    ctx.fillText(
      `${labelH} →`,
      MAP_SIZE - PADDING - 28,
      MAP_SIZE - PADDING + 18
    );
    ctx.fillText(`↑ ${labelV}`, PADDING - 20, PADDING - 8);

    ctx.fillStyle = "#334455";
    ctx.font = "9px monospace";
    for (let i = 0; i <= gc; i++) {
      const frac = i / gc;
      const wh = bounds.minX + frac * (bounds.maxX - bounds.minX);
      const wv = invertZ
        ? bounds.minZ + frac * (bounds.maxZ - bounds.minZ)
        : bounds.maxZ - frac * (bounds.maxZ - bounds.minZ);
      const px = PADDING + frac * (MAP_SIZE - PADDING * 2);
      const py = PADDING + frac * (MAP_SIZE - PADDING * 2);
      ctx.fillText(Math.round(wh), px - 10, MAP_SIZE - PADDING + 14);
      ctx.fillText(Math.round(wv), 2, py + 3);
    }

    pois.forEach((poi) => {
      const cat =
        CATEGORIES.find((c) => c.id === poi.category) || CATEGORIES[5];
      const { cx, cy } = toCanvas(
        Number(poi.coords[axisH]),
        Number(poi.coords[axisV])
      );
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

    ctx.restore();
  }, [
    pois,
    selectedId,
    zoom,
    pan,
    bounds,
    toCanvas,
    axisH,
    axisV,
    labelH,
    labelV,
    coordMode,
    invertZ,
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
  const handleWheel = (e) => {
    e.preventDefault();
    setZoom((z) =>
      Math.min(8, Math.max(0.3, z * (e.deltaY < 0 ? 1.12 : 0.89)))
    );
  };
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
        style={{ display: "block", borderRadius: 6, cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragging.current = false;
          setTooltip(null);
        }}
        onWheel={handleWheel}
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
                CATEGORIES.find((c) => c.id === tooltip.poi.category) ||
                CATEGORIES[5]
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
      {pois.length === 0 && (
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
function POICard({ poi, onDelete, onEdit, isSelected, onSelect, coordMode }) {
  const cat = CATEGORIES.find((c) => c.id === poi.category) || CATEGORIES[5];
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
          <button onClick={() => onEdit(poi)} style={btnStyle("#00E5FF")}>
            ✎
          </button>
          <button onClick={() => onDelete(poi.id)} style={btnStyle("#FF4444")}>
            ✕
          </button>
        </div>
      </div>
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

export default function App() {
  const saved = loadState();

  const [pois, setPois] = useState(saved?.pois ?? DEFAULT_POIS);
  const [coordMode, setCoordModeRaw] = useState(
    () => COORD_MODES.find((m) => m.id === saved?.coordMode) ?? COORD_MODES[0]
  );
  const [invertZ, setInvertZ] = useState(() => saved?.invertZ ?? false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("list");
  const [importErr, setImportErr] = useState(null);
  const importRef = useRef(null);

  // Persist on every change
  useEffect(() => {
    saveState(pois, coordMode.id, invertZ);
  }, [pois, coordMode, invertZ]);

  const setCoordMode = (mode) => setCoordModeRaw(mode);

  const filtered = useMemo(() => {
    let list = pois.filter((p) => {
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
  }, [pois, filterCat, search, sort]);

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
    setPois((p) => p.filter((poi) => poi.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
  };

  /* ── Export JSON ── */
  const handleExport = () => {
    const data = JSON.stringify(
      { version: 1, coordMode: coordMode.id, pois },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "poi-export.json";
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
        // Merge: add imported POIs that don't already exist (by id)
        const existingIds = new Set(pois.map((p) => p.id));
        const newPois = parsed.pois.filter((p) => !existingIds.has(p.id));
        setPois((prev) => [...prev, ...newPois]);
        if (parsed.coordMode)
          setCoordModeRaw(
            COORD_MODES.find((m) => m.id === parsed.coordMode) ?? coordMode
          );
        setImportErr(
          newPois.length === 0
            ? "Aucun nouveau POI importé (tous déjà présents)."
            : `${newPois.length} POI(s) importé(s) avec succès !`
        );
      } catch (err) {
        setImportErr("Erreur : fichier JSON invalide.");
      }
      e.target.value = "";
      setTimeout(() => setImportErr(null), 4000);
    };
    reader.readAsText(file);
  };

  const selPoi = pois.find((p) => p.id === selectedId);
  const selCat = selPoi
    ? CATEGORIES.find((c) => c.id === selPoi.category) || CATEGORIES[5]
    : null;

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
                {CATEGORIES.map((cat) => (
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

        {/* Toolbar: filters + coord mode + import/export */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Rechercher un POI..."
            style={{
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

          {/* Category filter */}
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
              TOUS ({pois.length})
            </button>
            {CATEGORIES.map((cat) => {
              const count = pois.filter((p) => p.category === cat.id).length;
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

          {/* Row: sort + coord mode + view toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ color: "#445", fontFamily: "monospace", fontSize: 11 }}
            >
              TRI :
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                background: "#1A1F2E",
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

            <span style={{ color: "#334", margin: "0 2px" }}>|</span>

            {/* Coord mode toggle */}
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

            {/* Invert Z axis toggle */}
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

            {/* View toggle */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button
                onClick={() => setView("list")}
                style={{
                  ...btnStyle(view === "list" ? "#00E5FF" : "#445"),
                  background: view === "list" ? "#00E5FF22" : "transparent",
                  fontSize: 11,
                  padding: "3px 10px",
                }}
              >
                ☰
              </button>
              <button
                onClick={() => setView("map")}
                style={{
                  ...btnStyle(view === "map" ? "#00E5FF" : "#445"),
                  background: view === "map" ? "#00E5FF22" : "transparent",
                  fontSize: 11,
                  padding: "3px 10px",
                }}
              >
                ⊕
              </button>
            </div>
          </div>

          {/* Import / Export */}
          <div style={{ display: "flex", gap: 8 }}>
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
        </div>

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
              selectedId={selectedId}
              onSelect={setSelectedId}
              coordMode={coordMode}
              invertZ={invertZ}
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
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
