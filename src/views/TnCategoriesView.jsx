import React, { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../constants";
import { buildCategoriaTN } from "../utils";

// ─── Keys for each nivel ───────────────────────────────────────────────────────
const NK = ["nivel1", "nivel2", "nivel3", "nivel4"];
const PANEL_LABELS = ["Principales", "Categorías", "Subcategorías", "Tipos"];
const PANEL_ADD_LABELS = [
  "Agregar principal...",
  "Agregar categoría...",
  "Agregar subcategoría...",
  "Agregar tipo...",
];

// ─── Mobile breakpoint ─────────────────────────────────────────────────────────
function useIsMobile(bp = 720) {
  const [is, setIs] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return is;
}

// ─── InlineInput — stable module-level component ───────────────────────────────
function InlineInput({ placeholder, initialValue = "", onSave, onCancel }) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "6px 10px", background: `${C.accent}08`,
      borderTop: `1px solid ${C.border}`,
    }}>
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") onSave(val.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "5px 9px", borderRadius: 6,
          border: `1px solid ${C.accent}`, background: C.bg,
          color: C.text, fontSize: 13, outline: "none",
        }}
      />
      <button
        onClick={() => onSave(val.trim())}
        style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
      >✓</button>
      <button
        onClick={onCancel}
        style={{ background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontSize: 13, flexShrink: 0 }}
      >✕</button>
    </div>
  );
}

// ─── DeleteConfirm inline ──────────────────────────────────────────────────────
function DeleteRow({ label, onConfirm, onCancel }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "7px 10px", background: `${C.danger}10`,
      borderBottom: `1px solid ${C.border}`, fontSize: 12,
    }}>
      <span style={{ color: C.danger, flex: 1 }}>
        ¿Eliminar <strong>{label}</strong>?
      </span>
      <button
        onClick={onConfirm}
        style={{ padding: "2px 12px", borderRadius: 5, border: "none", background: C.danger, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
      >Sí</button>
      <button
        onClick={onCancel}
        style={{ padding: "2px 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}
      >No</button>
    </div>
  );
}

// ─── PanelRow ──────────────────────────────────────────────────────────────────
function PanelRow({ label, childCount, productCount, isSelected, onSelect, onEdit, onDelete, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => !disabled && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "8px 10px",
        cursor: disabled ? "default" : "pointer",
        background: isSelected ? `${C.accent}12` : hovered ? C.surface2 : "transparent",
        borderLeft: `3px solid ${isSelected ? C.accent : "transparent"}`,
        borderBottom: `1px solid ${C.border}`,
        fontSize: 13, color: isSelected ? C.accent : C.text,
        fontWeight: isSelected ? 600 : 400,
        transition: "background 0.1s",
        minHeight: 36,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
        {label}
        {childCount > 0 && (
          <span style={{ fontSize: 11, color: C.textDim, fontWeight: 400, marginLeft: 4 }}>({childCount})</span>
        )}
        {productCount > 0 && (
          <span style={{ fontSize: 10, color: C.success, fontWeight: 600, marginLeft: 4 }}>·{productCount}p</span>
        )}
      </span>
      <div style={{ display: "flex", gap: 1, flexShrink: 0, opacity: isSelected || hovered ? 1 : 0.3, transition: "opacity 0.1s" }}>
        <button onClick={e => { e.stopPropagation(); !disabled && onEdit(); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", fontSize: 11, borderRadius: 3, color: C.textMuted }}
          title="Editar">✏️</button>
        <button onClick={e => { e.stopPropagation(); !disabled && onDelete(); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", fontSize: 11, borderRadius: 3, color: C.danger }}
          title="Eliminar">🗑</button>
      </div>
    </div>
  );
}

// ─── KeywordsEditor — stable module-level component ───────────────────────────
function KeywordsEditor({ row, onSave }) {
  const [kwInput, setKwInput] = useState("");
  const [saving, setSaving] = useState(false);

  const keywords = useMemo(
    () => row?.keywords ? row.keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
    [row?.keywords]
  );

  if (!row) return null;

  const pathLabel = NK.map(k => row[k]).filter(Boolean).join(" > ");

  const add = async () => {
    const kw = kwInput.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) { setKwInput(""); return; }
    setSaving(true);
    await onSave({ id: row.id, keywords: [...keywords, kw].join(", ") });
    setSaving(false);
    setKwInput("");
  };

  const remove = async (kw) => {
    await onSave({ id: row.id, keywords: keywords.filter(k => k !== kw).join(", ") });
  };

  return (
    <div style={{
      padding: "13px 18px",
      borderTop: `2px solid ${C.accent}30`,
      background: C.surface,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
        🏷 Keywords de{" "}
        <span style={{ color: C.accent }}>{pathLabel}</span>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
          — para clasificación automática de productos
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 28, alignItems: "center" }}>
        {keywords.length === 0 && (
          <span style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>
            Sin keywords. Agregá una para mejorar el matching automático.
          </span>
        )}
        {keywords.map(kw => (
          <span key={kw} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 10px 3px 12px", borderRadius: 20,
            background: `${C.accent}15`, border: `1px solid ${C.accent}40`,
            color: C.text, fontSize: 12,
          }}>
            {kw}
            <button onClick={() => remove(kw)}
              style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: "0 0 0 2px", fontSize: 14, lineHeight: 1, display: "flex" }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={kwInput}
          onChange={e => setKwInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="Escribí una keyword y Enter..."
          disabled={saving}
          style={{
            flex: 1, maxWidth: 280, padding: "6px 10px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: C.bg,
            color: C.text, fontSize: 12, outline: "none",
          }}
        />
        <button
          onClick={add}
          disabled={!kwInput.trim() || saving}
          style={{
            padding: "6px 14px", borderRadius: 7, border: "none",
            background: kwInput.trim() && !saving ? C.accent : C.border,
            color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: kwInput.trim() && !saving ? "pointer" : "default",
          }}
        >+ Agregar</button>
      </div>
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────
export default function TnCategoriesView({
  tnCategories = [],
  loading,
  onSave,
  onDelete,
  classifiedProducts = [],
}) {
  const isMobile = useIsMobile();

  // selectedPath[i] = selected item name in panel i (0-indexed)
  const [selectedPath, setSelectedPath] = useState([]);

  // Inline state: which panel is adding/editing/deleting
  const [addingPanel, setAddingPanel]     = useState(null);          // panel index
  const [editingItem, setEditingItem]     = useState(null);          // { panelIdx, name }
  const [deletingItem, setDeletingItem]   = useState(null);          // { panelIdx, name }
  const [busy, setBusy]                   = useState(false);
  const [mobilePanel, setMobilePanel]     = useState(0);             // 0-based

  // ── Derived panel data ──────────────────────────────────────────────────────
  const visiblePanelCount = Math.min(selectedPath.length + 1, 4);

  const getPanelItems = (panelIdx) => {
    const parentPath = selectedPath.slice(0, panelIdx);
    const items = [...new Set(
      tnCategories
        .filter(r => parentPath.every((val, i) => r[NK[i]] === val))
        .map(r => r[NK[panelIdx]])
        .filter(Boolean)
    )];
    // Sort maintaining insertion order by orden field when possible
    return items;
  };

  const getChildCount = (panelIdx, name) => {
    if (panelIdx >= 3) return 0; // nivel4 es el nivel final
    const path = [...selectedPath.slice(0, panelIdx), name];
    return new Set(
      tnCategories
        .filter(r => path.every((val, i) => r[NK[i]] === val))
        .map(r => r[NK[panelIdx + 1]])
        .filter(Boolean)
    ).size;
  };

  // ── Product counts precomputed ──────────────────────────────────────────────
  const productCounts = useMemo(() => {
    const counts = {};
    classifiedProducts.forEach(p => {
      const cat = buildCategoriaTN(p, tnCategories);
      if (!cat) return;
      const parts = cat.split(" > ");
      for (let i = 1; i <= parts.length; i++) {
        const key = parts.slice(0, i).join(" > ");
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [classifiedProducts, tnCategories]);

  const getProductCount = (panelIdx, name) => {
    const path = [...selectedPath.slice(0, panelIdx), name];
    return productCounts[path.join(" > ")] || 0;
  };

  // ── Keywords: find the exact matching row for selectedPath ──────────────────
  const keywordsRow = useMemo(() => {
    if (selectedPath.length === 0) return null;
    return tnCategories.find(r =>
      selectedPath.every((val, i) => r[NK[i]] === val)
    ) || null;
  }, [tnCategories, selectedPath]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const selectItem = (panelIdx, name) => {
    const newPath = [...selectedPath.slice(0, panelIdx), name];
    setSelectedPath(newPath);
    setAddingPanel(null);
    setEditingItem(null);
    setDeletingItem(null);
    if (isMobile) setMobilePanel(Math.min(panelIdx + 1, 3));
  };

  // ── ADD ─────────────────────────────────────────────────────────────────────
  const handleAdd = async (value) => {
    if (!value) { setAddingPanel(null); return; }
    const payload = {};
    selectedPath.slice(0, addingPanel).forEach((val, i) => { payload[NK[i]] = val; });
    payload[NK[addingPanel]] = value;
    setBusy(true);
    const res = await onSave(payload);
    setBusy(false);
    setAddingPanel(null);
    if (res?.success !== false) selectItem(addingPanel, value);
  };

  // ── EDIT ────────────────────────────────────────────────────────────────────
  const handleEdit = async (newValue) => {
    if (!editingItem) { setEditingItem(null); return; }
    const { panelIdx, name } = editingItem;
    if (!newValue || newValue === name) { setEditingItem(null); return; }
    const parentPath = selectedPath.slice(0, panelIdx);
    const rows = tnCategories.filter(r =>
      parentPath.every((val, i) => r[NK[i]] === val) && r[NK[panelIdx]] === name
    );
    setBusy(true);
    for (const r of rows) await onSave({ id: r.id, [NK[panelIdx]]: newValue });
    if (selectedPath[panelIdx] === name) {
      const np = [...selectedPath]; np[panelIdx] = newValue; setSelectedPath(np);
    }
    setBusy(false);
    setEditingItem(null);
  };

  // ── DELETE ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingItem) return;
    const { panelIdx, name } = deletingItem;
    const parentPath = selectedPath.slice(0, panelIdx);
    const rows = tnCategories.filter(r =>
      parentPath.every((val, i) => r[NK[i]] === val) && r[NK[panelIdx]] === name
    );
    setBusy(true);
    for (const r of rows) await onDelete(r.id);
    if (selectedPath[panelIdx] === name) setSelectedPath(selectedPath.slice(0, panelIdx));
    setBusy(false);
    setDeletingItem(null);
  };

  // ── Panel renderer ───────────────────────────────────────────────────────────
  const renderPanel = (panelIdx) => {
    const isVisible = isMobile ? mobilePanel === panelIdx : true;
    const items = getPanelItems(panelIdx);
    const headerTitle = panelIdx > 0 && selectedPath[panelIdx - 1]
      ? selectedPath[panelIdx - 1]
      : PANEL_LABELS[panelIdx];
    const isAdding   = addingPanel === panelIdx;
    const canAdd     = panelIdx === 0 || selectedPath.length >= panelIdx;

    return (
      <div
        key={panelIdx}
        style={{
          display: isVisible ? "flex" : "none",
          flexDirection: "column",
          minWidth: 170,
          flex: 1,
          borderRight: panelIdx < visiblePanelCount - 1 ? `1px solid ${C.border}` : "none",
          overflow: "hidden",
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: "9px 12px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface2,
          fontSize: 10, fontWeight: 700, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.07em",
          flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {headerTitle}
          </span>
          {items.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: C.textDim }}>
              {items.length}
            </span>
          )}
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 && !isAdding && (
            <div style={{ padding: "14px 12px", fontSize: 12, color: C.textDim, fontStyle: "italic" }}>
              {canAdd ? "Vacío. Usá + Agregar." : "← Seleccioná uno"}
            </div>
          )}

          {items.map(name => {
            const isDel  = deletingItem?.panelIdx === panelIdx && deletingItem?.name === name;
            const isEdit = editingItem?.panelIdx  === panelIdx && editingItem?.name  === name;

            if (isDel) {
              return <DeleteRow key={name} label={name} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />;
            }
            if (isEdit) {
              return (
                <InlineInput key={`edit-${name}`} initialValue={name}
                  placeholder="Nuevo nombre..."
                  onSave={handleEdit}
                  onCancel={() => setEditingItem(null)}
                />
              );
            }
            return (
              <PanelRow
                key={name}
                label={name}
                childCount={getChildCount(panelIdx, name)}
                productCount={getProductCount(panelIdx, name)}
                isSelected={selectedPath[panelIdx] === name}
                onSelect={() => selectItem(panelIdx, name)}
                onEdit={() => { setEditingItem({ panelIdx, name }); setDeletingItem(null); setAddingPanel(null); }}
                onDelete={() => { setDeletingItem({ panelIdx, name }); setEditingItem(null); setAddingPanel(null); }}
                disabled={busy}
              />
            );
          })}

          {isAdding && (
            <InlineInput
              placeholder={PANEL_ADD_LABELS[panelIdx]}
              onSave={handleAdd}
              onCancel={() => setAddingPanel(null)}
            />
          )}
        </div>

        {/* Add button */}
        {!isAdding && canAdd && (
          <button
            onClick={() => { if (!busy) { setAddingPanel(panelIdx); setEditingItem(null); setDeletingItem(null); } }}
            disabled={busy}
            style={{
              padding: "9px 12px", border: "none",
              borderTop: `1px solid ${C.border}`,
              background: "transparent", color: C.accent,
              fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer",
              textAlign: "left", flexShrink: 0,
              opacity: busy ? 0.4 : 1,
            }}
          >
            + {PANEL_ADD_LABELS[panelIdx].replace("...", "")}
          </button>
        )}
      </div>
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            🛒 Categorías Tienda Nube
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>
            {tnCategories.length} entradas · hasta 4 niveles de jerarquía
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 12, color: C.textDim }}>Cargando...</span>}
          {busy    && <span style={{ fontSize: 12, color: C.accent }}>Guardando...</span>}
          {selectedPath.length > 0 && (
            <button
              onClick={() => setSelectedPath([])}
              style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}
            >
              Limpiar selección
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {selectedPath.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 12, color: C.textMuted }}>
          {selectedPath.map((name, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => { setSelectedPath(selectedPath.slice(0, i + 1)); setAddingPanel(null); setEditingItem(null); setDeletingItem(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: i === selectedPath.length - 1 ? C.accent : C.textMuted, fontWeight: i === selectedPath.length - 1 ? 600 : 400, fontSize: 12, padding: 0 }}
              >{name}</button>
              {i < selectedPath.length - 1 && <span style={{ color: C.textDim }}>›</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Mobile: panel tabs */}
      {isMobile && (
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
          {Array.from({ length: visiblePanelCount }, (_, i) => (
            <button
              key={i}
              onClick={() => setMobilePanel(i)}
              style={{
                padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12,
                background: mobilePanel === i ? C.accent : "transparent",
                color: mobilePanel === i ? "#fff" : C.textMuted,
                cursor: "pointer", flexShrink: 0,
              }}
            >
              {i === 0 ? "Principales" : selectedPath[i - 1] ?? PANEL_LABELS[i]}
            </button>
          ))}
        </div>
      )}

      {/* Panels cascade */}
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden",
        display: "flex", background: C.surface, minHeight: 380,
        overflowX: "auto",
      }}>
        {Array.from({ length: visiblePanelCount }, (_, i) => renderPanel(i))}
      </div>

      {/* Keywords area */}
      {keywordsRow && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <KeywordsEditor key={keywordsRow.id} row={keywordsRow} onSave={onSave} />
        </div>
      )}

      {/* Empty state */}
      {tnCategories.length === 0 && !loading && (
        <div style={{
          textAlign: "center", padding: "50px 20px",
          background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            Sin categorías configuradas
          </div>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Usá el panel izquierdo para crear tu árbol de categorías Tienda Nube.
          </p>
        </div>
      )}
    </div>
  );
}
