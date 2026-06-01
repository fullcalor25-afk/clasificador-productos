import React, { useState, useMemo } from "react";
import { C } from "../constants";
import { classifyProduct } from "../utils";

export default function ClassificationView({
  rules,
  onSaveRule,
  onDeleteRule,
  onResetRules,
  toast = null,
}) {
  const [activeTab, setActiveTab] = useState("REPUESTO");
  
  // Keyword add state
  const [newKeyword, setNewKeyword] = useState("");
  const [bulkKeywordsText, setBulkKeywordsText] = useState("");
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  // Pattern add state
  const [newPatternLevel, setNewPatternLevel] = useState("rubro_pattern");
  const [newPatternVal, setNewPatternVal] = useState("");
  const [newPatternWeight, setNewPatternWeight] = useState(30);

  // Regex testing tool state
  const [testRubroText, setTestRubroText] = useState("");
  const [testRubroRegex, setTestRubroRegex] = useState("");
  const [testRubroMatched, setTestRubroMatched] = useState(false);

  // Interactive Product classification tester state
  const [testProdName, setTestProdName] = useState("");
  const [testProdRubro, setTestProdRubro] = useState("");
  const [testProdSub, setTestProdSub] = useState("");
  const [testProdResult, setTestProdResult] = useState(null);

  // Filter keywords and patterns from active rules
  const activeKeywords = useMemo(() => {
    return rules.filter(r => r.nivel === "keyword" && r.tipo === activeTab);
  }, [rules, activeTab]);

  const activePatterns = useMemo(() => {
    return rules.filter(r => ["rubro_pattern", "subrubro_pattern"].includes(r.nivel));
  }, [rules]);

  // Scoring configurations
  const weightsConfig = useMemo(() => {
    // Return typical weights or find from rules
    return {
      rubroWeight: rules.find(r => r.nivel === "rubro_pattern")?.peso || 40,
      subrubroWeight: rules.find(r => r.nivel === "subrubro_pattern")?.peso || 30,
      keywordWeight: rules.find(r => r.nivel === "keyword")?.peso || 15,
    };
  }, [rules]);

  const handleAddKeywordChip = async () => {
    if (!newKeyword.trim()) return;
    const val = newKeyword.trim().toLowerCase();
    
    // Check local duplicate
    if (activeKeywords.some(k => k.valor === val)) {
      setNewKeyword("");
      return;
    }

    const res = await onSaveRule({
      tipo: activeTab,
      nivel: "keyword",
      valor: val,
      peso: activeTab === "PRODUCTO_COMPLETO" ? 20 : activeTab === "ACCESORIO" ? 10 : 15,
      activa: true
    });

    if (res.success) {
      setNewKeyword("");
    } else {
      toast?.error("Error guardando regla: " + res.error);
    }
  };

  const handleBulkKeywordsSubmit = async () => {
    if (!bulkKeywordsText.trim()) return;
    const list = bulkKeywordsText.split("\n").map(x => x.trim().toLowerCase()).filter(Boolean);

    let addedCount = 0;
    for (const val of list) {
      if (!activeKeywords.some(k => k.valor === val)) {
        await onSaveRule({
          tipo: activeTab,
          nivel: "keyword",
          valor: val,
          peso: activeTab === "PRODUCTO_COMPLETO" ? 20 : activeTab === "ACCESORIO" ? 10 : 15,
          activa: true
        });
        addedCount++;
      }
    }

    setBulkKeywordsText("");
    setShowBulkAdd(false);
    toast?.success(`Se agregaron ${addedCount} palabras clave a ${activeTab}.`);
  };

  const handleAddPattern = async () => {
    if (!newPatternVal.trim()) return;

    const res = await onSaveRule({
      tipo: activeTab,
      nivel: newPatternLevel,
      valor: newPatternVal.trim(),
      peso: newPatternWeight,
      activa: true
    });

    if (res.success) {
      setNewPatternVal("");
      setNewPatternWeight(30);
    } else {
      toast?.error("Error guardando regla: " + res.error);
    }
  };

  // Test Rubro regex
  const handleTestRubroRegex = () => {
    if (!testRubroRegex) return;
    try {
      const rx = new RegExp(testRubroRegex, "i");
      setTestRubroMatched(rx.test(testRubroText));
    } catch (e) {
      toast?.error("Regex inválida. Verificá la sintaxis.");
    }
  };

  // Test Product classification
  const handleTestProductSubmit = () => {
    if (!testProdName.trim()) return;
    const mockProduct = {
      PRODUCTO: testProdName,
      RUBRO: testProdRubro,
      "SUB RUBRO": testProdSub
    };
    const res = classifyProduct(mockProduct, rules);
    setTestProdResult(res);
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      
      {/* Visual Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            ⚙️ Configuración de Reglas de Clasificación
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Ajustá las palabras clave, regex de rubros y pesos. Los cambios aplican de inmediato en local y Gemini IA.
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm("¿Estás seguro que querés resetear todas las reglas a sus valores por defecto en Supabase?")) {
              onResetRules();
            }
          }}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.warning}`, background: `${C.warning}10`, color: C.warning, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          🔄 Sembrar / Restaurar valores por defecto
        </button>
      </div>

      {/* SECTION 1: TABBED KEYWORDS CHIPS */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          1. Palabras Clave del Negocio
        </h3>

        {/* Tab row */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, marginBottom: 14 }}>
          {["REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO"].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 16px",
                border: "none",
                background: "transparent",
                color: activeTab === t ? C.accent : C.textMuted,
                fontWeight: activeTab === t ? 700 : 500,
                fontSize: 13,
                borderBottom: `2px solid ${activeTab === t ? C.accent : "transparent"}`,
                cursor: "pointer",
                marginBottom: -11,
              }}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Chips Area */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", border: `1px solid ${C.border}`, padding: 12, borderRadius: 8, background: C.bg, minHeight: 120, marginBottom: 16 }}>
          {activeKeywords.length === 0 ? (
            <div style={{ color: C.textDim, fontSize: 12, alignSelf: "center", margin: "0 auto" }}>
              Sin palabras clave cargadas para esta pestaña. Agregá una abajo.
            </div>
          ) : (
            activeKeywords.map(k => (
              <span
                key={k.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  padding: "4px 10px",
                  borderRadius: 8,
                }}
              >
                {k.valor}
                <button
                  onClick={() => onDeleteRule(k.id)}
                  style={{ border: "none", background: "transparent", color: C.danger, fontWeight: 700, cursor: "pointer", fontSize: 10 }}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder={`Agregar nueva keyword para ${activeTab}...`}
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddKeywordChip(); }}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
          />
          <button
            onClick={handleAddKeywordChip}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Agregar chip
          </button>
          <button
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}
          >
            Agregar en masa...
          </button>
        </div>

        {/* Bulk insert keywords */}
        {showBulkAdd && (
          <div className="fade-in" style={{ marginTop: 14, background: C.surface2, borderRadius: 8, padding: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, display: "block", marginBottom: 6 }}>Pegá tu lista (Una palabra por línea):</label>
            <textarea
              value={bulkKeywordsText}
              onChange={e => setBulkKeywordsText(e.target.value)}
              placeholder="diafragma&#10;membrana&#10;valvula..."
              style={{ width: "100%", height: 80, padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setShowBulkAdd(false)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleBulkKeywordsSubmit} disabled={!bulkKeywordsText.trim()} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Cargar</button>
            </div>
          </div>
        )}

      </div>

      {/* SECTION 2: PATTERNS AND SCORING */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        
        {/* Rubro Regex Patterns */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            2. Patrones Regex (Rubros y Sub Rubros)
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, background: C.bg }}>
            {activePatterns.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 11, textAlign: "center", padding: "10px 0" }}>Sin patrones regex configurados</div>
            ) : (
              activePatterns.map(pat => (
                <div key={pat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }}>
                  <div style={{ fontFamily: "monospace", color: C.text }}>
                    {pat.valor} <span style={{ fontSize: 10, color: C.textDim }}>({pat.nivel === "rubro_pattern" ? "Rubro" : "Subrubro"})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: C.accent }}>+{pat.peso} pts</span>
                    <button onClick={() => onDeleteRule(pat.id)} style={{ border: "none", background: "transparent", color: C.danger, cursor: "pointer", fontWeight: 700 }}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Pattern Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: C.surface2, padding: 12, borderRadius: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select value={newPatternLevel} onChange={e => setNewPatternLevel(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12 }}>
                <option value="rubro_pattern">Regex Rubro</option>
                <option value="subrubro_pattern">Regex Subrubro</option>
              </select>
              <input
                type="number"
                placeholder="Peso (30)"
                value={newPatternWeight}
                onChange={e => setNewPatternWeight(parseInt(e.target.value) || 0)}
                style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="Expresión regular (ej: ^rep\.)"
                value={newPatternVal}
                onChange={e => setNewPatternVal(e.target.value)}
                style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, fontFamily: "monospace" }}
              />
              <button onClick={handleAddPattern} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+</button>
            </div>
          </div>
        </div>

        {/* Scoring settings & testing Regex */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            3. Testeador Regex
          </h3>
          <p style={{ fontSize: 12, color: C.textMuted }}>
            Escribí un nombre de rubro y una expresión regular para ver si matchean correctamente.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              placeholder="Rubro de prueba (ej: repuestos caldera)"
              value={testRubroText}
              onChange={e => setTestRubroText(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="Expresión regular (ej: repuesto|rep\.)"
                value={testRubroRegex}
                onChange={e => setTestRubroRegex(e.target.value)}
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12, fontFamily: "monospace" }}
              />
              <button onClick={handleTestRubroRegex} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Testear</button>
            </div>
          </div>

          {testRubroRegex && (
            <div style={{ padding: 10, borderRadius: 6, background: testRubroMatched ? `${C.success}10` : `${C.danger}10`, border: `1px solid ${testRubroMatched ? C.success : C.danger}30`, fontSize: 12, fontWeight: 600, color: testRubroMatched ? C.success : C.danger }}>
              {testRubroMatched ? "✅ Matchea con éxito" : "❌ No matchea"}
            </div>
          )}
        </div>

      </div>

      {/* SECTION 4: DETAILED DEBUGGER TESTER */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          4. Simulador / Depurador de Clasificación
        </h3>
        <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
          Simulá el resultado del motor con cualquier descripción de producto para entender los puntos sumados por cada palabra y patrón.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <input
            placeholder="Descripción del producto (ej: DIAFRAGMA ORBIS 76MM CALEFON)..."
            value={testProdName}
            onChange={e => setTestProdName(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 13 }}
          />
          <input
            placeholder="Rubro (ej: REPUESTOS)"
            value={testProdRubro}
            onChange={e => setTestProdRubro(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 13 }}
          />
          <input
            placeholder="Sub Rubro (ej: DIAFRAGMAS)"
            value={testProdSub}
            onChange={e => setTestProdSub(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 13 }}
          />
        </div>

        <button
          onClick={handleTestProductSubmit}
          disabled={!testProdName.trim()}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: testProdName.trim() ? C.accent : C.border, color: "#fff", fontSize: 13, fontWeight: 600, cursor: testProdName.trim() ? "pointer" : "default" }}
        >
          🔍 Ejecutar Simulación
        </button>

        {testProdResult && (
          <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase" }}>Resultado de Simulación</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginTop: 4 }}>
                {testProdResult.classification}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>Confianza: {testProdResult.confidence}%</span>
                <span style={{ fontSize: 12, color: C.textDim }}>Score: {testProdResult.score} pts</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Reglas y Keywords que matchearon:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {testProdResult.reasons.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.text, display: "flex", gap: 6 }}>
                    <span>•</span> <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
