import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { applyOrderDiscount, getOrder, type OrderDiscountItemLine, type OrderDiscountPayload } from "../../lib/ordersApi";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { formatCurrency } from "../../lib/format";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface ItemLineState {
  type: "Percentage" | "Rupees" | "";
  pct: string;
  rs: string;
}

export function SaleOrderDiscountForm({ orderId, onClose, onSaved }: Props) {
  const [applicable, setApplicable] = useState<"Yes" | "No" | "">("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"Invoice" | "Item" | "">("");

  // Invoice scope
  const [invoiceType, setInvoiceType] = useState<"Percentage" | "Rupees" | "">("");
  const [invoicePct, setInvoicePct] = useState("");
  const [invoiceRs, setInvoiceRs] = useState("");

  // Item scope
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemLines, setItemLines] = useState<Record<string, ItemLineState>>({});

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: order, isLoading: itemsLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId),
    enabled: scope === "Item",
  });
  const items = order?.items ?? [];

  function toggleItem(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        if (!itemLines[itemId]) setItemLines((l) => ({ ...l, [itemId]: { type: "", pct: "", rs: "" } }));
      }
      return next;
    });
  }

  function updateItemLine(itemId: string, patch: Partial<ItemLineState>) {
    setItemLines((l) => ({ ...l, [itemId]: { ...(l[itemId] ?? { type: "", pct: "", rs: "" }), ...patch } }));
  }

  async function handleSave() {
    if (!applicable) return setError("Select Discount Applicable");

    let payload: OrderDiscountPayload;
    if (applicable === "No") {
      payload = { applicable: false };
    } else {
      if (!reason.trim()) return setError("Discount Reason is required");
      if (!scope) return setError("Select a Discount Type");

      if (scope === "Invoice") {
        if (!invoiceType) return setError("Select Discount On");
        if (invoiceType === "Percentage" && !invoicePct) return setError("Discount (%) is required");
        if (invoiceType === "Rupees" && !invoiceRs) return setError("Discount (Rs) is required");
        payload = {
          applicable: true,
          reason,
          scope: "Invoice",
          type: invoiceType,
          discountPct: invoiceType === "Percentage" ? Number(invoicePct) : undefined,
          discountRs: invoiceType === "Rupees" ? Number(invoiceRs) : undefined,
        };
      } else {
        const ids = Array.from(selectedItemIds);
        if (ids.length === 0) return setError("Select at least one item");
        const lines: OrderDiscountItemLine[] = [];
        for (const itemId of ids) {
          const line = itemLines[itemId];
          if (!line?.type) return setError("Select Discount On for every selected item");
          if (line.type === "Percentage" && !line.pct) return setError("Enter Discount (%) for every selected item");
          if (line.type === "Rupees" && !line.rs) return setError("Enter Discount (Rs) for every selected item");
          lines.push({
            itemId,
            type: line.type,
            discountPct: line.type === "Percentage" ? Number(line.pct) : undefined,
            discountRs: line.type === "Rupees" ? Number(line.rs) : undefined,
          });
        }
        payload = { applicable: true, reason, scope: "Item", items: lines };
      }
    }

    setSaving(true);
    setError("");
    try {
      await applyOrderDiscount(orderId, payload);
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save the discount — ${detail}` : "Could not save the discount");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal title="Sale Order Discount Form" onClose={onClose} size="standard" sectionLabel="Discount Details">
        <div style={{ padding: "20px var(--space)", overflowY: "auto", flex: 1 }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          <ToggleGroup
            label="Discount Applicable"
            required
            value={applicable}
            onChange={(v) => setApplicable(v)}
            options={[
              { value: "Yes", label: "Yes" },
              { value: "No", label: "No" },
            ]}
          />

          {applicable === "Yes" && (
            <>
              <TextField label="Discount Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
              <ToggleGroup
                label="Discount Type"
                required
                value={scope}
                onChange={(v) => setScope(v)}
                options={[
                  { value: "Invoice", label: "IN Invoice" },
                  { value: "Item", label: "IN Item" },
                ]}
              />

              {scope === "Invoice" && (
                <>
                  <ToggleGroup
                    label="Discount On"
                    required
                    value={invoiceType}
                    onChange={(v) => setInvoiceType(v)}
                    options={[
                      { value: "Rupees", label: "Discount In Rs" },
                      { value: "Percentage", label: "Discount In %" },
                    ]}
                  />
                  {invoiceType === "Rupees" && (
                    <TextField
                      label="Discount (Rs)"
                      required
                      type="number"
                      value={invoiceRs}
                      onChange={(e) => setInvoiceRs(e.target.value)}
                    />
                  )}
                  {invoiceType === "Percentage" && (
                    <TextField
                      label="Discount (%)"
                      required
                      type="number"
                      value={invoicePct}
                      onChange={(e) => setInvoicePct(e.target.value)}
                    />
                  )}
                </>
              )}

              {scope === "Item" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                    Items <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  {itemsLoading && <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>Loading items…</p>}
                  {!itemsLoading && items.length === 0 && (
                    <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>This order has no items.</p>
                  )}
                  {!itemsLoading && items.length > 0 && (
                    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 40, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }} />
                            <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                              Item
                            </th>
                            <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                              Basic Amount
                            </th>
                            <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                              Discount On
                            </th>
                            <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
                            const checked = selectedItemIds.has(item.ITEM_ID);
                            const line = itemLines[item.ITEM_ID];
                            return (
                              <tr key={item.ITEM_ID} style={{ background: checked ? "var(--color-primary-tint)" : undefined }}>
                                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleItem(item.ITEM_ID)}
                                    style={{ width: 16, height: 16, cursor: "pointer" }}
                                  />
                                </td>
                                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)", fontWeight: 500, whiteSpace: "nowrap" }}>
                                  {item.PART_NAME || item.ITEM_ID}
                                </td>
                                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {formatCurrency(item.BASIC_AMOUNT)}
                                </td>
                                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
                                  {checked ? (
                                    <select
                                      value={line?.type ?? ""}
                                      onChange={(e) => updateItemLine(item.ITEM_ID, { type: e.target.value as "Rupees" | "Percentage" })}
                                      style={{ padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", fontSize: 13 }}
                                    >
                                      <option value="" disabled>
                                        Select…
                                      </option>
                                      <option value="Rupees">Discount In Rs</option>
                                      <option value="Percentage">Discount In %</option>
                                    </select>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
                                  {checked && line?.type === "Rupees" && (
                                    <input
                                      type="number"
                                      value={line.rs}
                                      onChange={(e) => updateItemLine(item.ITEM_ID, { rs: e.target.value })}
                                      placeholder="Rs"
                                      style={{ width: 90, padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", fontSize: 13 }}
                                    />
                                  )}
                                  {checked && line?.type === "Percentage" && (
                                    <input
                                      type="number"
                                      value={line.pct}
                                      onChange={(e) => updateItemLine(item.ITEM_ID, { pct: e.target.value })}
                                      placeholder="%"
                                      style={{ width: 90, padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", fontSize: 13 }}
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px var(--space)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-page)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
    </FormModal>
  );
}
