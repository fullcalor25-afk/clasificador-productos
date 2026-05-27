import React from "react";
import { C } from "../constants";

export default function Pagination({ page, totalPages, onPageChange, pageSize = 50, onPageSizeChange, totalItems }) {
  if (totalPages <= 1 && !onPageSizeChange) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "16px 20px",
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        fontSize: 13,
      }}
    >
      <div style={{ color: C.textMuted, display: "flex", alignItems: "center", gap: 12 }}>
        {totalItems !== undefined && (
          <span>
            Mostrando <strong>{Math.min(page * pageSize + 1, totalItems)}</strong> - <strong>{Math.min((page + 1) * pageSize, totalItems)}</strong> de <strong>{totalItems}</strong>
          </span>
        )}
        
        {onPageSizeChange && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Mostrar:</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(parseInt(e.target.value))}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 12,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={totalItems || 10000}>Todos</option>
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: page === 0 ? "transparent" : C.surface,
              color: page === 0 ? C.textDim : C.text,
              cursor: page === 0 ? "default" : "pointer",
              fontWeight: 500,
              fontSize: 12,
              transition: "all 0.2s",
            }}
          >
            ← Anterior
          </button>
          
          <span style={{ color: C.textMuted, fontWeight: 500, padding: "0 8px" }}>
            Página {page + 1} de {totalPages}
          </span>
          
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: page >= totalPages - 1 ? "transparent" : C.surface,
              color: page >= totalPages - 1 ? C.textDim : C.text,
              cursor: page >= totalPages - 1 ? "default" : "pointer",
              fontWeight: 500,
              fontSize: 12,
              transition: "all 0.2s",
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
