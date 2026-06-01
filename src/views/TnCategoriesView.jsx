import React, { useState, useMemo, useEffect, useRef } from "react";
import { C } from "../constants";
import { buildCategoriaTN } from "../utils";

// ─── Mobile breakpoint hook ────────────────────────────────────────────────────
function useIsMobile(bp = 720) {
  const [is, setIs] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return is;
}

// ─── InlineInput — at module level so React never recreates it ─────────────────
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
        style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
      >✓</button>
      <button
        onClick={onCancel}
        style={{ background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontSize: 13 }}
      >✕</button>
    </div>
  );
}

// ─── KeywordsEditor — at module level ─────────────────────────────────────────
function KeywordsEditor({ row, onSave }) {
  const [kwInput, setKwInput] = useState("");
  const [saving, setSaving] = useState(false);

  const keywords = useMemo(
    () => row?.keywords ? row.keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
    [row?.keywords]
  );

  if (!row) return null;

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

  const displayName = [row.nivel3, row.nivel4].filter(Boolean).join(" > ");

  return (
    <div style={{
      padding: "14px 18px",
      borderTop: `2px solid ${C.accent}30`,
      background: C.surface,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
        🏷 Keywords de{" "}
        <span style={{ color: C.accent }}>{displayName}</span>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
          — usadas para asignación automática
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 30, alignItems: "center" }}>
        {keywords.length === 0 && (
          <span style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>
            Sin keywords. Agregá una para mejorar la clasificación automática.
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
            <button
              onClick={() => remove(kw)}
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
            flex: 1, maxWidth: 260, padding: "6px 10px", borderRadius: 7,
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
        >
          + Agregar
        </button>
      </div>
    </div>
  );
}

// ─── DeleteConfirm inline row ──────────────────────────────────────────────────
function DeleteRow({ label, onConfirm, onCancel }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", background: `${C.danger}10`,
      borderBottom: `1px solid ${C.border}`, fontSize: 12,
    }}>
      <span style={{ color: C.danger, flex: 1 }}>
        ¿Eliminar <strong>{label}</strong>?
      </span>
      <button
        onClick={onConfirm}
        style={{ padding: "3px 12px", borderRadius: 5, border: "none", background: C.danger, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
      >Sí</button>
      <button
        onClick={onCancel}
        style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}
      >No</button>
    </div>
  );
}

// ─── Single panel item row ──────────────────────────────────────────────────────
function PanelRow({ label, count, isSelected, onSelect, onEdit, onDelete, disabled }) {
  const [hovered, setHovered] = useState(false);
  const show = isSelected || hovered;

  return (
    <div
      onClick={() => !disabled && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center",
        padding: "8px 12px",
        cursor: disabled ? "default" : "pointer",
        background: isSelected ? `${C.accent}12` : hovered ? C.surface2 : "transparent",
        borderLeft: `3px solid ${isSelected ? C.accent : "transparent"}`,
        borderBottom: `1px solid ${C.border}`,
        fontSize: 13, color: isSelected ? C.accent : C.text,
        fontWeight: isSelected ? 600 : 400,
        transition: "background 0.1s, border-color 0.1s",
        gap: 4,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {count > 0 && (
          <span style={{ fontSize: 11, color: C.textDim, fontWeight: 400, marginLeft: 4 }}>({count})</span>
        )}
      </span>
      <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: show ? 1 : 0, transition: "opacity 0.1s" }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          title="Editar"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 12, borderRadius: 4, color: C.textMuted }}
        >✏️</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Eliminar"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 12, borderRadius: 4, color: C.danger }}
        >🗑</button>
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

  // ── Selection state ──
  const [sel1, setSel1] = useState(null);
  const [sel2, setSel2] = useState(null);
  const [sel3, setSel3] = useState(null); // row id

  // ── Add state per panel ──
  const [adding1, setAdding1] = useState(false);
  const [adding2, setAdding2] = useState(false);
  const [adding3, setAdding3] = useState(false);

  // ── Edit state per panel ──
  const [editing1, setEditing1] = useState(null); // nivel1 name being edited
  const [editing2, setEditing2] = useState(null); // nivel2 name being edited
  const [editing3, setEditing3] = useState(null); // row id being edited

  // ── Delete confirm state per panel ──
  const [deleting1, setDeleting1] = useState(null); // nivel1 name
  const [deleting2, setDeleting2] = useState(null); // nivel2 name
  const [deleting3, setDeleting3] = useState(null); // row id

  // ── General busy state during API calls ──
  const [busy, setBusy] = useState(false);

  // ── Mobile panel navigation ──
  const [mobilePanel, setMobilePanel] = useState(1);

  // ── Derived lists ──
  const nivel1List = useMemo(
    () => [...new Set(tnCategories.map(r => r.nivel1).filter(Boolean))].sort(),
    [tnCategories]
  );

  const nivel2List = useMemo(() => {
    if (!sel1) return [];
    return [...new Set(
      tnCategories.filter(r => r.nivel1 === sel1 && r.nivel2).map(r => r.nivel2)
    )];
  }, [tnCategories, sel1]);

  const nivel3Rows = useMemo(() => {
    if (!sel1 || !sel2) return [];
    return tnCategories.filter(r => r.nivel1 === sel1 && r.nivel2 === sel2);
  }, [tnCategories, sel1, sel2]);

  const selectedRow = useMemo(
    () => sel3 ? nivel3Rows.find(r => r.id === sel3) : null,
    [nivel3Rows, sel3]
  );

  // ── Product counts per category path ──
  const productCounts = useMemo(() => {
    const counts = {};
    classifiedProducts.forEach(p => {
      const cat = buildCategoriaTN(p, tnCategories);
      if (!cat) return;
      const parts = cat.split(" > ");
      if (parts[0]) counts[parts[0]] = (counts[parts[0]] || 0) + 1;
      if (parts[1]) counts[`${parts[0]} > ${parts[1]}`] = (counts[`${parts[0]} > ${parts[1]}`] || 0) + 1;
      // full path count
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [classifiedProducts, tnCategories]);

  const rowPath = r => [r.nivel1, r.nivel2, r.nivel3, r.nivel4].filter(Boolean).join(" > ");
  const rowLabel = r => [r.nivel3, r.nivel4].filter(Boolean).join(" > ") || "(sin nombre)";

  // ── Navigation helpers ──
  const selectNivel1 = (name) => {
    setSel1(name);
    setSel2(null); setSel3(null);
    setAdding2(false); setEditing2(null); setDeleting2(null);
    setAdding3(false); setEditing3(null); setDeleting3(null);
    if (isMobile) setMobilePanel(2);
  };

  const selectNivel2 = (name) => {
    setSel2(name);
    setSel3(null);
    setAdding3(false); setEditing3(null); setDeleting3(null);
    if (isMobile) setMobilePanel(3);
  };

  // ── ADD handlers ──
  const handleAdd1 = async (value) => {
    if (!value) { setAdding1(false); return; }
    setBusy(true);
    const res = await onSave({ nivel1: value });
    setBusy(false);
    setAdding1(false);
    if (res?.success) selectNivel1(value);
  };

  const handleAdd2 = async (value) => {
    if (!value || !sel1) { setAdding2(false); return; }
    setBusy(true);
    const res = await onSave({ nivel1: sel1, nivel2: value });
    setBusy(false);
    setAdding2(false);
    if (res?.success) selectNivel2(value);
  };

  const handleAdd3 = async (value) => {
    if (!value || !sel1 || !sel2) { setAdding3(false); return; }
    setBusy(true);
    await onSave({ nivel1: sel1, nivel2: sel2, nivel3: value, keywords: "" });
    setBusy(false);
    setAdding3(false);
  };

  // ── EDIT handlers ──
  const handleEdit1 = async (newValue) => {
    if (!newValue || !editing1) { setEditing1(null); return; }
    if (newValue === editing1) { setEditing1(null); return; }
    setBusy(true);
    const rows = tnCategories.filter(r => r.nivel1 === editing1);
    for (const r of rows) await onSave({ id: r.id, nivel1: newValue });
    if (sel1 === editing1) setSel1(newValue);
    setBusy(false);
    setEditing1(null);
  };

  const handleEdit2 = async (newValue) => {
    if (!newValue || !editing2) { setEditing2(null); return; }
    if (newValue === editing2) { setEditing2(null); return; }
    setBusy(true);
    const rows = tnCategories.filter(r => r.nivel1 === sel1 && r.nivel2 === editing2);
    for (const r of rows) await onSave({ id: r.id, nivel2: newValue });
    if (sel2 === editing2) setSel2(newValue);
    setBusy(false);
    setEditing2(null);
  };

  const handleEdit3 = async (newValue) => {
    if (!newValue || !editing3) { setEditing3(null); return; }
    setBusy(true);
    await onSave({ id: editing3, nivel3: newValue });
    setBusy(false);
    setEditing3(null);
  };

  // ── DELETE handlers ──
  const handleDelete1 = async () => {
    if (!deleting1) return;
    setBusy(true);
    const rows = tnCategories.filter(r => r.nivel1 === deleting1);
    for (const r of rows) await onDelete(r.id);
    if (sel1 === deleting1) { setSel1(null); setSel2(null); setSel3(null); }
    setBusy(false);
    setDeleting1(null);
  };

  const handleDelete2 = async () => {
    if (!deleting2) return;
    setBusy(true);
    const rows = tnCategories.filter(r => r.nivel1 === sel1 && r.nivel2 === deleting2);
    for (const r of rows) await onDelete(r.id);
    if (sel2 === deleting2) { setSel2(null); setSel3(null); }
    setBusy(false);
    setDeleting2(null);
  };

  const handleDelete3 = async () => {
    if (!deleting3) return;
    setBusy(true);
    await onDelete(deleting3);
    if (sel3 === deleting3) setSel3(null);
    setBusy(false);
    setDeleting3(null);
  };

  // ─── Panel rendering helper ───────────────────────────────────────────────────
  const panelStyle = (visible) => ({
    flex: 1,
    display: visible ? "flex" : "none",
    flexDirection: "column",
    borderRight: `1px solid ${C.border}`,
    minWidth: 0,
    overflow: "hidden",
  });

  const panelHeaderStyle = {
    padding: "10px 14px",
    borderBottom: `1px solid ${C.border}`,
    background: C.surface2,
    fontSize: 11, fontWeight: 700, color: C.textMuted,
    textTransform: "uppercase", letterSpacing: "0.07em",
    flexShrink: 0,
  };

  const addBtnStyle = {
    padding: "9px 14px", border: "none",
    borderTop: `1px solid ${C.border}`,
    background: "transparent", color: C.accent,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    textAlign: "left", flexShrink: 0,
    opacity: busy ? 0.4 : 1,
  };

  const emptyStyle = {
    padding: "14px 12px", fontSize: 12, color: C.textDim, fontStyle: "italic",
  };

  // Mobile: which panels to show
  const show1 = isMobile ? mobilePanel === 1 : true;
  const show2 = isMobile ? mobilePanel === 2 : true;
  const show3 = isMobile ? mobilePanel === 3 : true;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            🛒 Categorías Tienda Nube
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>
            {tnCategories.length} entradas configuradas · {nivel1List.length} principales
          </p>
        </div>
        {loading && <span style={{ fontSize: 12, color: C.textDim }}>Cargando...</span>}
        {busy   && <span style={{ fontSize: 12, color: C.accent }}>Guardando...</span>}
      </div>

      {/* ── Mobile back nav ── */}
      {isMobile && mobilePanel > 1 && (
        <button
          onClick={() => setMobilePanel(p => p - 1)}
          style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}
        >
          ← {mobilePanel === 2 ? "Principales" : sel1}
        </button>
      )}

      {/* ── Cascade panels ── */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        background: C.surface,
        minHeight: 420,
      }}>

        {/* ═══ PANEL 1 — nivel1 ═══ */}
        <div style={{ ...panelStyle(show1) }}>
          <div style={panelHeaderStyle}>
            Principales
            {nivel1List.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 5 }}>({nivel1List.length})</span>}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {nivel1List.length === 0 && !adding1 && (
              <p style={emptyStyle}>Sin categorías principales.</p>
            )}

            {nivel1List.map(name => {
              if (deleting1 === name) {
                return (
                  <DeleteRow key={name} label={name}
                    onConfirm={handleDelete1}
                    onCancel={() => setDeleting1(null)}
                  />
                );
              }
              if (editing1 === name) {
                return (
                  <InlineInput key={name} initialValue={name} placeholder="Nombre principal..."
                    onSave={handleEdit1}
                    onCancel={() => setEditing1(null)}
                  />
                );
              }
              return (
                <PanelRow
                  key={name}
                  label={name}
                  count={productCounts[name] || 0}
                  isSelected={sel1 === name}
                  onSelect={() => selectNivel1(name)}
                  onEdit={() => { setEditing1(name); setDeleting1(null); }}
                  onDelete={() => { setDeleting1(name); setEditing1(null); }}
                  disabled={busy}
                />
              );
            })}

            {adding1 && (
              <InlineInput placeholder="Nombre de la categoría principal..."
                onSave={handleAdd1}
                onCancel={() => setAdding1(false)}
              />
            )}
          </div>

          {!adding1 && (
            <button style={addBtnStyle} onClick={() => { setAdding1(true); setEditing1(null); setDeleting1(null); }} disabled={busy}>
              + Agregar principal
            </button>
          )}
        </div>

        {/* ═══ PANEL 2 — nivel2 ═══ */}
        <div style={{ ...panelStyle(show2) }}>
          <div style={panelHeaderStyle}>
            Categorías
            {nivel2List.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 5 }}>({nivel2List.length})</span>}
            {sel1 && <span style={{ color: C.accent, marginLeft: 5, textTransform: "none", fontWeight: 400 }}>· {sel1}</span>}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {!sel1 && <p style={emptyStyle}>Seleccioná un principal →</p>}
            {sel1 && nivel2List.length === 0 && !adding2 && (
              <p style={emptyStyle}>Sin categorías. Usá + Agregar.</p>
            )}

            {nivel2List.map(name => {
              const key2 = `${sel1} > ${name}`;
              if (deleting2 === name) {
                return (
                  <DeleteRow key={name} label={name}
                    onConfirm={handleDelete2}
                    onCancel={() => setDeleting2(null)}
                  />
                );
              }
              if (editing2 === name) {
                return (
                  <InlineInput key={name} initialValue={name} placeholder="Nombre de categoría..."
                    onSave={handleEdit2}
                    onCancel={() => setEditing2(null)}
                  />
                );
              }
              return (
                <PanelRow
                  key={name}
                  label={name}
                  count={productCounts[key2] || 0}
                  isSelected={sel2 === name}
                  onSelect={() => selectNivel2(name)}
                  onEdit={() => { setEditing2(name); setDeleting2(null); }}
                  onDelete={() => { setDeleting2(name); setEditing2(null); }}
                  disabled={busy || !sel1}
                />
              );
            })}

            {adding2 && (
              <InlineInput placeholder="Nombre de la categoría..."
                onSave={handleAdd2}
                onCancel={() => setAdding2(false)}
              />
            )}
          </div>

          {!adding2 && sel1 && (
            <button style={addBtnStyle} onClick={() => { setAdding2(true); setEditing2(null); setDeleting2(null); }} disabled={busy}>
              + Agregar categoría
            </button>
          )}
        </div>

        {/* ═══ PANEL 3 — nivel3/nivel4 rows ═══ */}
        <div style={{ ...panelStyle(show3), borderRight: "none" }}>
          <div style={panelHeaderStyle}>
            Subcategorías
            {nivel3Rows.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 5 }}>({nivel3Rows.length})</span>}
            {sel2 && <span style={{ color: C.accent, marginLeft: 5, textTransform: "none", fontWeight: 400 }}>· {sel2}</span>}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {!sel2 && <p style={emptyStyle}>Seleccioná una categoría →</p>}
            {sel2 && nivel3Rows.length === 0 && !adding3 && (
              <p style={emptyStyle}>Sin subcategorías. Usá + Agregar.</p>
            )}

            {nivel3Rows.map(row => {
              const label = rowLabel(row);
              const path  = rowPath(row);

              if (deleting3 === row.id) {
                return (
                  <DeleteRow key={row.id} label={label}
                    onConfirm={handleDelete3}
                    onCancel={() => setDeleting3(null)}
                  />
                );
              }
              if (editing3 === row.id) {
                return (
                  <InlineInput key={row.id} initialValue={row.nivel3 || ""} placeholder="Nombre de subcategoría..."
                    onSave={handleEdit3}
                    onCancel={() => setEditing3(null)}
                  />
                );
              }
              return (
                <PanelRow
                  key={row.id}
                  label={label}
                  count={productCounts[path] || 0}
                  isSelected={sel3 === row.id}
                  onSelect={() => setSel3(row.id)}
                  onEdit={() => { setEditing3(row.id); setDeleting3(null); }}
                  onDelete={() => { setDeleting3(row.id); setEditing3(null); }}
                  disabled={busy}
                />
              );
            })}

            {adding3 && (
              <InlineInput placeholder="Nombre de la subcategoría..."
                onSave={handleAdd3}
                onCancel={() => setAdding3(false)}
              />
            )}
          </div>

          {!adding3 && sel2 && (
            <button style={addBtnStyle} onClick={() => { setAdding3(true); setEditing3(null); setDeleting3(null); }} disabled={busy}>
              + Agregar subcategoría
            </button>
          )}
        </div>
      </div>

      {/* ── Keywords area (shown when a nivel3 row is selected) ── */}
      {selectedRow && (
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}>
          <KeywordsEditor
            key={selectedRow.id}
            row={selectedRow}
            onSave={onSave}
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {tnCategories.length === 0 && !loading && (
        <div style={{
          textAlign: "center", padding: "50px 20px",
          background: C.surface, borderRadius: 14,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            Sin categorías configuradas
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
            Usá el panel izquierdo para crear tu árbol de categorías Tienda Nube.
          </p>
        </div>
      )}
    </div>
  );
}
