import { useIsMobile } from "../../lib/responsive";

/** Fixed desktop dimensions for every modal form in the app — two tiers, chosen once here
 * so no form drifts from another. Mobile never uses these (see FormModal below): it always
 * gets full-width/full-height instead, exactly as every form already did before this file
 * existed. "Small" is for simple pickers with only a couple of fields (Load Limit Details,
 * Attach Orders, Sale Order Upload); "Standard" is for everything else, including multi-tab
 * forms — height is fixed regardless of which tab/conditional field is showing, so the modal
 * itself never resizes/jumps as the doer fills it in (the bug this component fixes: a form
 * used to start short and grow once a conditional field appeared, which twice required a
 * one-off `minHeight` hack to stop a dropdown panel from being clipped by `overflow:hidden`
 * — that hack is gone now that height is never content-driven). */
export const FORM_MODAL_SIZES = {
  small: { width: 400, height: 300 },
  standard: { width: 800, height: 500 },
} as const;

interface FormModalProps {
  title: string;
  onClose: () => void;
  /** @default "standard" */
  size?: keyof typeof FORM_MODAL_SIZES;
  /** @default 50 — bump for nested modals stacked on top of another FormModal (e.g. 55, 60). */
  zIndex?: number;
  /** Static centered section-label bar under the title (e.g. "Vehicle Details",
   * "Dispatch Details") — the single-tab-styled-as-a-section convention used by most forms.
   * Omit for forms that render their own interactive tab strip as the first child instead. */
  sectionLabel?: string;
  /** Rendered in the header instead of the ✕ close button — e.g. Save/Cancel buttons for
   * nested forms that don't use a footer bar. */
  headerActions?: React.ReactNode;
  /** Body + footer content. Rendered directly below the header/section-label bar; the
   * scrollable body area and footer bar are each child's own responsibility (matching the
   * existing convention every form already used), FormModal only fixes the outer frame. */
  children: React.ReactNode;
}

export function FormModal({ title, onClose, size = "standard", zIndex = 50, sectionLabel, headerActions, children }: FormModalProps) {
  const isMobile = useIsMobile();
  const { width, height } = FORM_MODAL_SIZES[size];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        background: "rgba(17,17,20,0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? "100%" : `min(${width}px, calc(100vw - 48px))`,
          height: isMobile ? "100dvh" : `min(${height}px, 90vh)`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: isMobile ? 0 : 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>{title}</h2>
          {headerActions ?? (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "var(--color-bg-page)",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-muted)",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {sectionLabel && (
          <div style={{ padding: "0 var(--space)", flexShrink: 0 }}>
            <div
              style={{
                textAlign: "center",
                fontWeight: 600,
                fontSize: 14,
                color: "var(--color-primary)",
                paddingBottom: 10,
                borderBottom: "2px solid var(--color-primary)",
              }}
            >
              {sectionLabel}
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
