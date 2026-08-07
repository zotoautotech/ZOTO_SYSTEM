export function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB");
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return `${date}, ${time.toLowerCase()}`;
}

/** Today's date as `YYYY-MM-DD`, for pre-filling an `<input type="date">`.
 *
 * Built from the LOCAL date parts on purpose — `toISOString().slice(0, 10)` is the obvious
 * one-liner but it converts to UTC first, and IST is UTC+5:30, so any doer filling a form
 * before 5:30am would get handed yesterday's date as the default. */
export function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
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
