export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="card slide-in-panel"
        style={{
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "var(--space)",
          background: "var(--color-bg)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
