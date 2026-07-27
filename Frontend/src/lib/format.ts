export function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB");
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return `${date}, ${time.toLowerCase()}`;
}

export function formatCurrency(value: string | number): string {
  // Some sheet columns (e.g. "Invoice Discount (Rs)") have currency number formatting applied
  // directly in Google Sheets, so the API can hand back a value like "₹3,565.00" instead of a
  // plain number — Number() on that returns NaN and silently displayed as ₹0.00, hiding the
  // real amount. Strip everything but digits/dot/minus before parsing so both forms work.
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : value;
  if (Number.isNaN(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
