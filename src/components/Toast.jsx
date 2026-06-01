import { useState } from "react";
import { C } from "../constants";

const TOAST_COLORS = {
  success: { bg: C.success, icon: "✅" },
  error:   { bg: C.danger,  icon: "❌" },
  info:    { bg: C.accent,  icon: "ℹ️" },
  warning: { bg: C.warning, icon: "⚠️" },
};

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  return {
    toasts,
    success: msg => addToast(msg, "success"),
    error:   msg => addToast(msg, "error"),
    info:    msg => addToast(msg, "info"),
    warning: msg => addToast(msg, "warning"),
  };
}

export function ToastContainer({ toasts }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map(t => {
        const c = TOAST_COLORS[t.type] || TOAST_COLORS.info;
        return (
          <div
            key={t.id}
            className="fade-in"
            style={{
              background: c.bg, color: "#fff",
              padding: "11px 18px", borderRadius: 10,
              fontSize: 13, fontWeight: 500,
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              display: "flex", alignItems: "center", gap: 8,
              maxWidth: 380, pointerEvents: "auto",
            }}
          >
            <span>{c.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
