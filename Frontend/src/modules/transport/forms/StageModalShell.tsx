import { FormModal } from "../../../components/form/FormModal";

/** Shared header/tab-bar chrome for the trip stage forms (Reached/Stock Release/Tax
 * Invoice/Dispatch/LR/Delivery) — same modal shell as StageForm.tsx, just reused directly
 * since each of these forms has enough bespoke conditional logic to not fit the single
 * config-driven StageForm pattern used for PDI. Thin wrapper around the shared FormModal
 * (fixed "standard" size, no resizing as fields appear). */
export function StageModalShell({
  title,
  tabLabel,
  onClose,
  children,
}: {
  title: string;
  tabLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <FormModal title={title} onClose={onClose} size="standard" sectionLabel={tabLabel}>
      {children}
    </FormModal>
  );
}
