import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { applyOrderDiscount, getOrder, type OrderDiscountItemLine, type OrderDiscountPayload } from "../../lib/ordersApi";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { TextField } from "../../components/form/TextField";
import { formatCurrency } from "../../lib/format";
import { useIsMobile } from "../../lib/responsive";

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
  const isMobile = useIsMobile();
  const [applicable, setApplicable] = useState<"Yes" | "No" | "">("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
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
          description,
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
        payload = { applicable: true, reason, description, scope: "Item", items: lines };
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 17, 20, 0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        zIndex: 50,
        padding: isMobile ? 0 : 24,
      }}
      onClick={onClose}
    >
      <div
        className="card modal-in"
        style={{
          width: "min(680px, 100%)",
          height: isMobile ? "calc(100dvh - 34px)" : undefined,
          maxHeight: isMobile ? "calc(100dvh - 34px)" : "90vh",
          background: "var(--color-bg)",
          borderRadius: isMobile ? 0 : 18,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isMobile ? "28px var(--space) 12px" : "22px var(--space) 12px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Sale Order Discount Form</h2>
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
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
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
            Discount Details
          </div>
        </div>

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
              <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
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
                <div>
                  <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                    Items <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  {itemsLoading && <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>Loading items…</p>}
                  {!itemsLoading && items.length === 0 && (
                    <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>This order has no items.</p>
                  )}
                  {items.map((item) => {
                    const checked = selectedItemIds.has(item.ITEM_ID);
                    const line = itemLines[item.ITEM_ID];
                    return (
                      <div
                        key={item.ITEM_ID}
                        className="card"
                        style={{ padding: 14, marginBottom: 10, border: "1px solid var(--color-border)" }}
                      >
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.ITEM_ID)}
                            style={{ width: 18, height: 18 }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{item.PART_NAME || item.ITEM_ID}</span>
                          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-muted)" }}>
                            {formatCurrency(item.BASIC_AMOUNT)}
                          </span>
                        </label>

                        {checked && (
                          <div style={{ marginTop: 12, paddingLeft: 28 }}>
                            <ToggleGroup
                              label="Discount On"
                              required
                              value={line?.type ?? ""}
                              onChange={(v) => updateItemLine(item.ITEM_ID, { type: v })}
                              options={[
                                { value: "Rupees", label: "Discount In Rs" },
                                { value: "Percentage", label: "Discount In %" },
                              ]}
                            />
                            {line?.type === "Rupees" && (
                              <TextField
                                label="Discount (Rs)"
                                required
                                type="number"
                                value={line.rs}
                                onChange={(e) => updateItemLine(item.ITEM_ID, { rs: e.target.value })}
                              />
                            )}
                            {line?.type === "Percentage" && (
                              <TextField
                                label="Discount (%)"
                                required
                                type="number"
                                value={line.pct}
                                onChange={(e) => updateItemLine(item.ITEM_ID, { pct: e.target.value })}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)",
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
      </div>
    </div>
  );
}
