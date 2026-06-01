import React, { useState } from "react";
import { C } from "../constants";

export default function SettingsView({
  classifiedProductsCount = 0,
  historyCount = 0,
  correctionsCount = 0,
  categoriesCount = 0,
  onResetSession,
  onResetRules,
  onClearHistory,
  onClearCorrections,
  toast = null,
}) {
  // Groq override key
  const [groqKey, setGroqKey] = useState(() => {
    return localStorage.getItem("clasificador_groq_key") || "";
  });

  // e-commerce export defaults
  const [stockDef, setStockDef] = useState(() => {
    return localStorage.getItem("tn_default_stock") || "1";
  });
  const [currencyDef, setCurrencyDef] = useState(() => {
    return localStorage.getItem("tn_default_currency") || "ARS";
  });
  const [showNoPrice, setShowNoPrice] = useState(() => {
    return localStorage.getItem("tn_show_no_price") || "NO";
  });
  const [skuPrefix, setSkuPrefix] = useState(() => {
    return localStorage.getItem("tn_sku_prefix") || "";
  });

  // Dangerous triggers input checks
  const [confirmHistoryInput, setConfirmHistoryInput] = useState("");
  const [confirmCorrectionsInput, setConfirmCorrectionsInput] = useState("");

  const handleSaveSettings = () => {
    if (groqKey.trim()) {
      localStorage.setItem("clasificador_groq_key", groqKey.trim());
    } else {
      localStorage.removeItem("clasificador_groq_key");
    }

    localStorage.setItem("tn_default_stock", stockDef);
    localStorage.setItem("tn_default_currency", currencyDef);
    localStorage.setItem("tn_show_no_price", showNoPrice);
    localStorage.setItem("tn_sku_prefix", skuPrefix);

    toast?.success("Ajustes guardados con éxito.");
  };

  const handleClearCache = () => {
    if (confirm("¿Limpiar todo el caché local de navegación (no borrará la base de datos)?")) {
      localStorage.clear();
      toast?.info("Caché local borrado. Recargando...");
      setTimeout(() => window.location.reload(), 800);
    }
  };

  const handleResetDangerousHistory = () => {
    if (confirmHistoryInput !== "BORRAR HISTORIAL") return;
    onClearHistory();
    setConfirmHistoryInput("");
    toast?.success("Todo el historial fue eliminado de la base de datos.");
  };

  const handleResetDangerousCorrections = () => {
    if (confirmCorrectionsInput !== "BORRAR APRENDIZAJE") return;
    onClearCorrections();
    setConfirmCorrectionsInput("");
    toast?.success("Toda la base de aprendizaje fue eliminada.");
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40, maxWidth: 680, margin: "0 auto" }}>
      
      {/* Visual Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          🔧 Ajustes Generales de la Aplicación
        </h2>
        <p style={{ fontSize: 13, color: C.textMuted }}>
          Configurá las conexiones, parámetros de catálogo para Tienda Nube y claves de API de IA.
        </p>
      </div>

      {/* Groq API Key Panel */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          🔑 Clave de API Personalizada (Groq IA)
        </h3>
        <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          Por defecto la app usa la clave configurada en Netlify. Si querés usar tu propio límite de Groq, ingresá tu clave acá. Se guardará de forma segura en tu navegador.
        </p>
        <input
          type="password"
          placeholder="gsk_..."
          value={groqKey}
          onChange={e => setGroqKey(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
        />
      </div>

      {/* Tienda Nube settings */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          🛒 Parámetros por Defecto de Catálogo Tienda Nube
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Stock inicial por defecto</label>
            <input
              type="number"
              value={stockDef}
              onChange={e => setStockDef(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Moneda base</label>
            <input
              value={currencyDef}
              onChange={e => setCurrencyDef(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Mostrar productos sin precio</label>
            <select
              value={showNoPrice}
              onChange={e => setShowNoPrice(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, cursor: "pointer" }}
            >
              <option value="SI">SÍ (Mostrar en la tienda)</option>
              <option value="NO">NO (Mantener como borrador/oculto)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Prefijo SKU (Opcional)</label>
            <input
              placeholder="ej: HVAC-"
              value={skuPrefix}
              onChange={e => setSkuPrefix(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      {/* Supabase Status connection summary */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          🔌 Estado de la Conexión Base de Datos (Supabase)
        </h3>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span>Estado del Servidor:</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.success }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.success }} /> Conectado en tiempo real
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center", marginTop: 6 }}>
          <div style={{ background: C.surface2, borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>HISTORIAL</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{historyCount} análisis</div>
          </div>
          <div style={{ background: C.surface2, borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>APRENDIZAJE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{correctionsCount} reglas</div>
          </div>
          <div style={{ background: C.surface2, borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>CATEGORÍAS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{categoriesCount} nodos</div>
          </div>
        </div>
      </div>

      {/* Save Trigger Button */}
      <button
        onClick={handleSaveSettings}
        style={{
          padding: "12px 24px",
          borderRadius: 10,
          border: "none",
          background: C.accent,
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 6px -1px rgba(37,99,235,0.2)",
          alignSelf: "flex-end",
        }}
      >
        Guardar Configuración
      </button>

      {/* DANGEROUS TRIGGERS */}
      <div style={{ border: `1px solid ${C.danger}40`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.danger }}>
          ⚠️ Zona Roja de Seguridad
        </h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          {/* Clear Session */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <strong style={{ color: C.text }}>Limpiar sesión en memoria</strong>
              <div style={{ fontSize: 11, color: C.textMuted }}>Descarta los {classifiedProductsCount} productos activos en caché.</div>
            </div>
            <button
              onClick={onResetSession}
              disabled={classifiedProductsCount === 0}
              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, cursor: classifiedProductsCount === 0 ? "default" : "pointer" }}
            >
              Resetear Sesión
            </button>
          </div>

          <div style={{ height: 1, background: C.border }} />

          {/* Delete History */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <strong style={{ color: C.text }}>Eliminar TODO el Historial de Análisis</strong>
                <div style={{ fontSize: 11, color: C.textMuted }}>Acción destructiva. Borra permanentemente los {historyCount} guardados en Supabase.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <input
                type="text"
                placeholder="Escribí BORRAR HISTORIAL para confirmar"
                value={confirmHistoryInput}
                onChange={e => setConfirmHistoryInput(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.danger}30`, background: C.bg, fontSize: 12 }}
              />
              <button
                onClick={handleResetDangerousHistory}
                disabled={confirmHistoryInput !== "BORRAR HISTORIAL"}
                style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: confirmHistoryInput === "BORRAR HISTORIAL" ? C.danger : C.border, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                Eliminar Historial
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: C.border }} />

          {/* Delete Learning Corrections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <strong style={{ color: C.text }}>Eliminar TODO el Aprendizaje</strong>
                <div style={{ fontSize: 11, color: C.textMuted }}>Acción destructiva. Borra las {correctionsCount} correcciones memorizadas.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <input
                type="text"
                placeholder="Escribí BORRAR APRENDIZAJE para confirmar"
                value={confirmCorrectionsInput}
                onChange={e => setConfirmCorrectionsInput(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.danger}30`, background: C.bg, fontSize: 12 }}
              />
              <button
                onClick={handleResetDangerousCorrections}
                disabled={confirmCorrectionsInput !== "BORRAR APRENDIZAJE"}
                style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: confirmCorrectionsInput === "BORRAR APRENDIZAJE" ? C.danger : C.border, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                Eliminar Aprendizaje
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: C.border }} />

          {/* Clear Cache */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <strong style={{ color: C.text }}>Limpiar caché de navegación local</strong>
              <div style={{ fontSize: 11, color: C.textMuted }}>Resetea estados guardados y configuraciones locales.</div>
            </div>
            <button
              onClick={handleClearCache}
              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}
            >
              Borrar caché
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
