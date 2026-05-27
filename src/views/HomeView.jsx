import React from "react";
import { C } from "../constants";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";
import { fmtDate } from "../utils";

export default function HomeView({
  setView,
  classifiedProducts,
  stats,
  historyList,
  onLoadHistoryDetail,
  onResetSession,
  onExportHistory
}) {
  const hasActiveSession = classifiedProducts.length > 0;
  const recentAnalyses = historyList.slice(0, 5);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 28, paddingBottom: 40 }}>
      {/* Banner de sesión activa */}
      {hasActiveSession && (
        <div
          style={{
            background: `linear-gradient(135deg, ${C.accentBg}, rgba(16, 185, 129, 0.05))`,
            border: `1px solid ${C.accent}30`,
            borderRadius: 16,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔄</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Sesión activa en memoria
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                Tenés un análisis en progreso con <strong>{classifiedProducts.length}</strong> productos clasificados.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setView("dashboard")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: C.accent,
                color: "#fff",
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#1d4ed8"}
              onMouseLeave={e => e.currentTarget.style.background = C.accent}
            >
              Continuar análisis →
            </button>
            <button
              onClick={onResetSession}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${C.danger}30`,
                color: C.danger,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.danger}12`}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Descartar ×
            </button>
          </div>
        </div>
      )}

      {/* active session stats card row */}
      {hasActiveSession && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
            Resumen del análisis activo
          </h3>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard label="Total en memoria" value={classifiedProducts.length} color={C.accent} icon="📊" />
            <StatCard label="Repuestos" value={stats.REPUESTO || 0} color="#f59e0b" icon="⚙️" pct={Math.round(((stats.REPUESTO || 0) / classifiedProducts.length) * 100)} />
            <StatCard label="Accesorios" value={stats.ACCESORIO || 0} color="#8b5cf6" icon="🔩" pct={Math.round(((stats.ACCESORIO || 0) / classifiedProducts.length) * 100)} />
            <StatCard label="Correcciones aprendidas" value={stats._aprendidos || 0} color="#06b6d4" icon="📚" />
          </div>
        </div>
      )}

      {/* Main Grid: Recent activities & Quick shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        
        {/* Recent analyses */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            Análisis guardados recientes
          </h3>
          {recentAnalyses.length === 0 ? (
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "40px 20px",
                textAlign: "center",
                color: C.textDim,
              }}
            >
              <span style={{ fontSize: 32, display: "block", marginBottom: 10 }}>📁</span>
              No tenés análisis guardados en Supabase.
            </div>
          ) : (
            recentAnalyses.map(a => (
              <div
                key={a.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>
                    {a.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>
                    {fmtDate(a.created_at)}
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.textMuted }}>
                    <span>📊 {a.total} total</span>
                    {a.repuestos > 0 && <span style={{ color: "#d97706" }}>⚙️ {a.repuestos}</span>}
                    {a.accesorios > 0 && <span style={{ color: "#7c3aed" }}>🔩 {a.accesorios}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => onLoadHistoryDetail(a.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "transparent",
                      border: `1px solid ${C.border}`,
                      color: C.accent,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = C.accentBg;
                      e.currentTarget.style.borderColor = C.accent;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = C.border;
                    }}
                  >
                    Ver
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Access Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            Acceso Rápido
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Nueva Carga", icon: "📤", desc: "Pegá datos o subí CSV", view: "upload", color: C.accent },
              { label: "Aprendizaje", icon: "🧠", desc: "Gestión de memoria", view: "learning", color: "#06b6d4" },
              { label: "Categorías", icon: "📁", desc: "Árbol jerárquico", view: "categories", color: "#10b981" },
              { label: "Ajustes", icon: "🔧", desc: "API Keys y e-commerce", view: "settings", color: "#64748b" },
            ].map(shortcut => (
              <div
                key={shortcut.label}
                onClick={() => setView(shortcut.view)}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: 16,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  transition: "all 0.25s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = shortcut.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <span style={{ fontSize: 24 }}>{shortcut.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{shortcut.label}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{shortcut.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Dynamic Active Session categories */}
          {hasActiveSession && classifiedProducts.some(p => p._categoria) && (
            <div style={{ marginTop: 12 }}>
              {(() => {
                const catCounts = {};
                classifiedProducts.forEach(p => {
                  if (p._categoria) catCounts[p._categoria] = (catCounts[p._categoria] || 0) + 1;
                });
                const chartItems = Object.entries(catCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([label, value]) => ({ label, value }));
                return <BarChart items={chartItems} title="Distribución de Categorías en el análisis actual" color="#10b981" />;
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
