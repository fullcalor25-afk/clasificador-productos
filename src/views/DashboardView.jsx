import React from "react";
import { C, CLS } from "../constants";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";

export default function DashboardView({
  classifiedProducts,
  stats,
  setView,
  setFilter,
  setPage,
  aiLoading,
  aiStatus,
  aiError,
  aiProcessed,
  onRunAI,
  onStopAI,
  aiResultsCount = 0
}) {
  const lowConfidenceCount = classifiedProducts.filter(p => !p._manualClass && p._class.confidence < 60).length;
  
  // Calculate distribution items
  const distributionItems = Object.entries(stats)
    .filter(([k, v]) => v > 0 && !k.startsWith("_"))
    .map(([key, val]) => ({
      key,
      val,
      pct: Math.round((val / classifiedProducts.length) * 100),
      cfg: CLS[key] || CLS.OTRO,
    }))
    .sort((a, b) => b.val - a.val);

  // Rubros stats
  const rubrosWithRepuestos = React.useMemo(() => {
    const counts = {};
    classifiedProducts
      .filter(p => (p._manualClass || p._class.classification) === "REPUESTO")
      .forEach(p => {
        const r = p.RUBRO || "Sin Rubro";
        counts[r] = (counts[r] || 0) + 1;
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [classifiedProducts]);

  // Categories stats — derivadas de TN nivel2
  const activeCategories = React.useMemo(() => {
    const counts = {};
    classifiedProducts.forEach(p => {
      const cat = p._tn_nivel2 || p._enriched?.categoria_tiendanube?.split(' > ')[1] || p._categoria || null;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [classifiedProducts]);

  const handleCardClick = (filterVal) => {
    setFilter(filterVal);
    setPage(0);
    setView("table");
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      
      {/* Metric Cards Row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard
          label="Total analizados"
          value={classifiedProducts.length}
          color={C.accent}
          icon="📊"
          onClick={() => handleCardClick("ALL")}
        />
        <StatCard
          label="Repuestos"
          value={stats.REPUESTO || 0}
          color="#f59e0b"
          icon="⚙️"
          pct={Math.round(((stats.REPUESTO || 0) / classifiedProducts.length) * 100)}
          onClick={() => handleCardClick("REPUESTO")}
        />
        <StatCard
          label="Accesorios"
          value={stats.ACCESORIO || 0}
          color="#8b5cf6"
          icon="🔩"
          pct={Math.round(((stats.ACCESORIO || 0) / classifiedProducts.length) * 100)}
          onClick={() => handleCardClick("ACCESORIO")}
        />
        <StatCard
          label="Completos"
          value={stats.PRODUCTO_COMPLETO || 0}
          color="#10b981"
          icon="📦"
          pct={Math.round(((stats.PRODUCTO_COMPLETO || 0) / classifiedProducts.length) * 100)}
          onClick={() => handleCardClick("PRODUCTO_COMPLETO")}
        />
        <StatCard
          label="Aprendidos"
          value={stats._aprendidos || 0}
          color="#06b6d4"
          icon="📚"
          onClick={() => handleCardClick("REVIEW")}
        />
      </div>

      {/* Review Alert Panel */}
      {lowConfidenceCount > 0 && (
        <div
          onClick={() => handleCardClick("REVIEW")}
          style={{
            background: `${C.danger}0b`,
            border: `1px solid ${C.danger}40`,
            borderRadius: 14,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            cursor: "pointer",
            transition: "transform 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24, color: C.danger }}>⚠️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.danger }}>
                Revisión sugerida por baja confianza
              </div>
              <div style={{ fontSize: 12, color: C.text }}>
                Hay <strong>{lowConfidenceCount}</strong> productos cuya confianza de clasificación local es menor al <strong>60%</strong>.
              </div>
            </div>
          </div>
          <button
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: C.danger,
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Revisar ahora
          </button>
        </div>
      )}

      {/* AI Processing Panel */}
      <div
        style={{
          background: `linear-gradient(135deg, rgba(59,130,246,0.06), rgba(245,158,11,0.06))`,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              🤖 Enriquecimiento & Clasificación con IA (Groq)
            </h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Mejorá la precisión inyectando las categorías de tu e-commerce y asignando códigos por IA. 
              {aiResultsCount > 0 && <span style={{ color: C.success, fontWeight: 600, marginLeft: 6 }}>✓ {aiResultsCount} productos procesados con IA</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {aiLoading ? (
              <button
                onClick={onStopAI}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: `1px solid ${C.danger}`,
                  background: "transparent",
                  color: C.danger,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⏹ Parar IA
              </button>
            ) : (
              <button
                onClick={onRunAI}
                style={{
                  padding: "10px 22px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, var(--accent), var(--warning))",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(59,130,246,0.15)",
                }}
              >
                {aiResultsCount > 0 ? "🔄 Volver a procesar con IA" : "🚀 Activar IA (Groq)"}
              </button>
            )}
          </div>
        </div>

        {aiLoading && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.accent, fontWeight: 600, marginBottom: 6 }}>
              <span>{aiStatus}</span>
              <span>{aiProcessed} / {classifiedProducts.length} productos</span>
            </div>
            <div style={{ height: 8, background: C.surface2, borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(aiProcessed / classifiedProducts.length) * 100}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
              Tiempo estimado restante: ~{Math.round(((classifiedProducts.length - aiProcessed) / 50) * 10)} segundos
            </div>
          </div>
        )}

        {aiError && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: `${C.danger}10`, border: `1px solid ${C.danger}30`, fontSize: 12, color: C.danger, fontWeight: 500 }}>
            ⚠️ {aiError}
          </div>
        )}
      </div>

      {/* Distribution Progress Bar */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Distribución de clasificaciones
        </h3>
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: C.surface2, marginBottom: 14 }}>
          {distributionItems.map(item => (
            <div
              key={item.key}
              style={{
                width: `${(item.val / classifiedProducts.length) * 100}%`,
                background: item.cfg.color || C.accent,
                transition: "width 0.5s ease",
              }}
              title={`${item.cfg.label}: ${item.val} (${item.pct}%)`}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {distributionItems.map(item => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: item.cfg.color }} />
              <span style={{ color: C.textMuted }}>{item.cfg.label}:</span>
              <strong style={{ color: C.text }}>{item.val}</strong>
              <span style={{ color: C.textDim }}>({item.pct}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Double Column Graphs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <BarChart items={rubrosWithRepuestos} max={classifiedProducts.length} title="Rubros con más repuestos detectados" color="#f59e0b" />
        {activeCategories.length > 0 && (
          <BarChart items={activeCategories} max={classifiedProducts.length} title="Top Categorías asignadas por IA" color="#10b981" />
        )}
      </div>

    </div>
  );
}
