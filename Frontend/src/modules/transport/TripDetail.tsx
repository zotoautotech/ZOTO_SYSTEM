import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrip } from "../../lib/tripsApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";
import { getTripStage } from "../../lib/tripStages";
import { openAttachment } from "../../lib/attachments";
import { AttachOrdersModal } from "./AttachOrdersModal";
import { ReachedForm } from "./forms/ReachedForm";
import { StockReleaseForm } from "./forms/StockReleaseForm";
import { TaxInvoiceForm } from "./forms/TaxInvoiceForm";
import { DispatchForm } from "./forms/DispatchForm";
import { LRForm } from "./forms/LRForm";
import { DeliveryForm } from "./forms/DeliveryForm";
import { QuickAction } from "../../components/FloatingActionButton";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

/** Same compact table-card pattern as OrderDetail.tsx's "Order Punch Parts" (title + count
 * badge + horizontally scrollable table) — used here for "S.O Dispatches" (attached orders)
 * and "S.O Items Dispatches" (their line items), matching the old CRR reference layout. */
function TableCard<T>({
  title,
  count,
  columns,
  rows,
  getRowKey,
  onRowClick,
  onExpand,
}: {
  title: string;
  count: number;
  columns: { header: string; render: (row: T) => React.ReactNode }[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  onExpand?: () => void;
}) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <span
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "1px 9px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            {count}
          </span>
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            style={{ border: "none", background: "none", color: "var(--color-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 4 }}
          >
            Expand
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No items</p>
      ) : (
        <div className="sheet-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.header}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--color-border)",
                      borderRight: i === columns.length - 1 ? "none" : "1px solid var(--color-border)",
                    }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={getRowKey(row, i)}
                  onClick={() => onRowClick?.(row)}
                  style={{ cursor: onRowClick ? "pointer" : "default" }}
                  onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = "var(--color-bg-page)")}
                  onMouseLeave={(e) => onRowClick && (e.currentTarget.style.background = "transparent")}
                >
                  {columns.map((col) => (
                    <td key={col.header} style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: "0 0 160px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1 }}>{value}</div>
    </div>
  );
}

/** Same "View attachment" link pattern as OrderDetail.tsx's own FieldFile — reused here
 * unchanged for the auto-generated Dispatch Gate Pass PDF, which is stored as a normal
 * private Drive file by the time this renders (see Backend/src/services/gatePass.ts). */
function FieldFile({ label, fileId, linkLabel }: { label: string; fileId?: string; linkLabel?: string }) {
  if (!fileId) return null;
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: "0 0 160px" }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        <button
          type="button"
          onClick={() => openAttachment(fileId)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          {linkLabel ?? `View ${label}`}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const STAGE_FORM_BY_KEY: Record<string, React.ComponentType<{ transportId: string; onClose: () => void; onSaved: () => void }>> = {
  "transport-reached": ReachedForm,
  "stock-release": StockReleaseForm,
  "tax-invoice": TaxInvoiceForm,
  dispatch: DispatchForm,
  "collect-lr": LRForm,
  delivery: DeliveryForm,
};

/** Shared detail/management page for a trip, opened from any of the 7 Transport-family
 * module routes. Shows the trip's vehicle info + attached orders, and whichever action is
 * next valid for the current route's stage (Attach Orders while OPEN, or that route's
 * stage form once the trip's Status matches). */
export function TripDetail() {
  const { transportId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const moduleKey = location.pathname.split("/")[2];
  const [showAttach, setShowAttach] = useState(false);
  const [showStageForm, setShowStageForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trip", transportId],
    queryFn: () => getTrip(transportId!),
    enabled: !!transportId,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Trip not found</p>;

  // taxInvoiceItems defaults to [] defensively — if the backend serving this request is on
  // an older deploy than this frontend bundle (a real ordering hazard across two separate
  // Vercel projects), the field would be missing entirely and every .reduce/.length call
  // below would throw, white-screening the whole page with no error boundary to catch it.
  const { transport, orders, orderSnapshot, dispatches, items, taxInvoiceItems = [], stockReleaseDone, taxInvoiceDone, gatePassFileId, stockReleaseAttachmentFileId, stockReleaseFrom, stockReleaseStatus, taxInvoiceNo, taxInvoiceDate, taxInvoiceAttachmentFileId, taxInvoiceRemarks } = data;
  const stage = getTripStage(moduleKey);
  const order = orders[0];
  // orderSnapshot (Transport_SO's own row) carries several fields ORDER_PUNCH doesn't —
  // Freight Paid by/at, Transporter GSTIN/PAN/Person Name/Contact/Address, Marka Code — since
  // those are per-trip choices captured at attach time, not order-level defaults. Prefer it
  // for anything it has; fall back to the order snapshot only where orderSnapshot lacks the
  // field entirely (Payment Type, Basic/Tax/Total/Invoice Discount amounts).
  const snap = (field: string) => orderSnapshot?.[field] || "";
  const isTaxInvoice = stage?.key === "tax-invoice";
  // order.BASIC_AMOUNT/TAX_AMOUNT/TOTAL_AMOUNT are the ORDER's own lifetime totals across ALL
  // its items at their FULL order quantity — correct for "what this order is worth overall,"
  // but wrong for "what THIS invoice covers" whenever a dispatch is split across rounds (an
  // item can have some of its quantity on this trip's invoice and the rest on a future one).
  // taxInvoiceItems is already scaled per-item to this trip's own load quantity (see
  // tripRoutes.ts's scaledItemFields), so summing those gives this invoice's real total.
  const invoiceBasicAmount = taxInvoiceItems.reduce((sum, it) => sum + (Number(it.basicAmount) || 0), 0);
  const invoiceTaxAmount = taxInvoiceItems.reduce((sum, it) => sum + (Number(it.taxAmount) || 0), 0);
  const invoiceTotalAmount = taxInvoiceItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
  const StageForm = stage ? STAGE_FORM_BY_KEY[stage.key] : undefined;
  // Stock Release / Tax Invoice run in parallel off the same REACHED status — Status alone
  // can't tell "still pending this branch" apart from "done this branch, other one still
  // pending," so also check that specific branch's own completion flag (see tripStages.ts).
  const thisBranchDone =
    stage?.key === "stock-release" ? stockReleaseDone : stage?.key === "tax-invoice" ? taxInvoiceDone : false;
  const canGiveStageForm = !!stage && transport.Status === stage.prevStatus && !thisBranchDone;
  // Orders are attached during trip creation now (CreateTripModal's nested Select Sale
  // Orders flow) — this action is only for the defensive edge case of a trip that
  // somehow ended up with zero orders, not a normal next step after Arrange Vehicle.
  const canAttachOrders = transport.Status === "OPEN" && orders.length === 0;

  return (
    <div>
      <button onClick={() => navigate(`/modules/${moduleKey}`)} className="btn" style={{ marginBottom: 16 }}>
        ‹ Back
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "0 0 260px" }}>
          <h2 style={{ margin: "8px 0 0" }}>{transport.Transport_ID}</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {formatTimestamp(transport.Timestamp)}
          </span>
          {/* Stock Release / Tax Invoice run in parallel off the same REACHED status, so
              transport.Status alone can't show which of the two is actually done — this
              badge surfaces that branch's own Pending/Completed state directly. */}
          {(stage?.key === "stock-release" || stage?.key === "tax-invoice") && (
            <div style={{ marginTop: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: thisBranchDone ? "#e6f4ea" : "#fff4e5",
                  color: thisBranchDone ? "#1e7e34" : "#b26a00",
                }}
              >
                {stage!.label} {thisBranchDone ? "Completed" : "Pending"}
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            {canAttachOrders && <QuickAction label="Attach Orders" onClick={() => setShowAttach(true)} stackIndex={0} />}
            {canGiveStageForm && <QuickAction label={`Give ${stage!.label} Form`} onClick={() => setShowStageForm(true)} stackIndex={canAttachOrders ? 1 : 0} />}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          {isTaxInvoice && (
            <Section title="GST Details">
              <Field label="Invoice Discount (Rs)" value={formatCurrency(order?.INVOICE_DISCOUNT_RS)} />
              <Field label="Basic Amount" value={formatCurrency(invoiceBasicAmount)} />
              {/* Blank on System 2 (tax-free) — Tax Amount only ever has anything to sum on
                  System 1's ORDER_ITEMS, not fabricated here. */}
              <Field label="Tax Amount" value={formatCurrency(invoiceTaxAmount)} />
              <Field label="Total Amount" value={formatCurrency(invoiceTotalAmount)} />
            </Section>
          )}

          <Section title="Vehicle Details">
            <Field label="Send Through" value={transport["Send Through"]} />
            <Field label="Vehicle Arrange for" value={transport["Vehicle Arrange for"]} />
            <Field label="Transporter" value={transport["Transporter Name"] || transport["Transporter ID"]} />
            <Field label="Vehicle Type" value={transport["Vehicle type"]} />
            <Field label="Vehicle No." value={transport["Vehicle No."]} />
            <Field label="Vehicle Size (Ft)" value={transport["Vehicle Size (Ft)"]} />
            <Field label="Driver Name" value={transport["Driver Name"]} />
            <Field label="Driver Contact No." value={transport["Driver Contact No."]} />
            <Field label="Freight Applicable" value={transport["Freight Applicable On Invoice?"]} />
            <Field label="Freight Charge" value={formatCurrency(transport["Freight Charge"])} />
            <FieldFile label="Dispatch Gate Pass" fileId={gatePassFileId} linkLabel="View Gate Pass" />
          </Section>

          {/* Only shown on the Stock Release stage's own detail page — same "blank until
              actually submitted" convention as Tax Invoice Details below. One attachment
              covers every item released in that submission (StockReleaseForm.tsx takes one
              shared "Attach Document" field, not per-item), so any one item's row on this
              trip carries it — stockReleaseAttachmentFileId picks the first non-blank one. */}
          {stage?.key === "stock-release" && (
            <Section title="Stock Release Details">
              <Field label="From" value={stockReleaseFrom} />
              <Field label="Status" value={stockReleaseStatus} />
              <FieldFile label="Attachment" fileId={stockReleaseAttachmentFileId} linkLabel="View Attachment" />
              {!stockReleaseFrom && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Not yet submitted.</p>}
            </Section>
          )}

          {isTaxInvoice && (
            <>
              <Section title="Buyer Details">
                <Field label="CUST ID" value={snap("CUST ID")} />
                <Field label="Customer Name" value={snap("Cutomer Name")} />
                <Field label="Marka Code" value={snap("Marka Code")} />
                <Field label="Business Segment" value={snap("Business Segment")} />
                <Field label="Type of Customer" value={snap("Type of Customer")} />
                <Field label="Buyer GSTIN No." value={snap("Buyer GSTIN No.")} />
                <Field label="Buyer Email ID" value={snap("Buyer Email ID")} />
                <Field label="Buyer Contact No." value={snap("Buyer Contact No.")} />
                <Field label="Payment Type" value={order?.PAYMENT_TYPE} />
                <Field label="Payment Terms" value={snap("Payment Terms")} />
                <Field label="This Order Payment Terms" value={snap("This Order Payment Terms")} />
                <Field label="Contact Person Name" value={snap("Contact Person Name")} />
                <Field label="Contact Person Contact No." value={snap("Contact Person Contact No.")} />
                <Field label="Sale Staff Name" value={snap("Sale Staff Name")} />
                <Field label="Order given by" value={snap("Order given by")} />
                <Field label="Ship to Consignee" value={snap("Ship to Consignee")} />
              </Section>

              {/* Only ever fills in once the Upload Tax Invoice Form action is actually
                  submitted — blank rather than fabricated until then. */}
              <Section title="Tax Invoice Details">
                <Field label="Tax Invoice No." value={taxInvoiceNo} />
                <Field label="Tax Invoice Date" value={taxInvoiceDate} />
                <FieldFile label="Tax Invoice Attachment" fileId={taxInvoiceAttachmentFileId} linkLabel="View Attachment" />
                <Field label="Tax Invoice Remarks" value={taxInvoiceRemarks} />
                {!taxInvoiceNo && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Not yet submitted.</p>}
              </Section>

              <Section title="E-Way Bill Details">
                <Field label="E-Way Bill Applicable" value={transport["E-Way Bill Applicable"]} />
                <Field label="E-Way Bill No." value={transport["E-Way Bill No."]} />
                <Field label="E-Way Bill Date" value={transport["E-Way Bill Date"]} />
                {!transport["E-Way Bill No."] && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Not yet submitted.</p>}
              </Section>
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          {isTaxInvoice && (
            <Section title="Logistics Details">
              <Field label="Delivery Mode" value={snap("Preferred Delivery Mode")} />
              <Field label="Freight Paid by" value={snap("Freight Paid by")} />
              <Field label="Freight Paid at" value={snap("Freight Paid at")} />
              <Field label="Transport Mode" value={snap("Preferred Transportation Mode")} />
              <Field label="Transporter Type" value={snap("Transporter Type")} />
              <Field label="Transporter ID" value={snap("Transporter ID")} />
              <Field label="Transporter Name" value={snap("Transporter Name")} />
              <Field label="PAN" value={snap("PAN")} />
              <Field label="Transporter Contact No." value={snap("Transporter Contact No.")} />
              <Field label="Transporter Person Name" value={snap("Transporter Person Name")} />
              <Field label="Transporter Person Contact No." value={snap("Transporter Person Contact No.")} />
              <Field label="Transporter Address" value={snap("Transporter Address")} />
            </Section>
          )}

          <TableCard
            title={isTaxInvoice ? "All SO's of this Tax Invoice" : "S.O Dispatches"}
            count={dispatches.length}
            rows={dispatches}
            getRowKey={(row) => row.transportSoId || row.orderId}
            onRowClick={(row) => navigate(`/modules/punch-order/${row.orderId}`)}
            onExpand={() => navigate(`/modules/${moduleKey}/${transportId}/dispatches`)}
            columns={[
              { header: "Cutomer Name", render: (row) => row.customerName || row.orderId },
              { header: "Transport_SO_ID", render: (row) => row.transportSoId || "—" },
              { header: "Timestamp", render: (row) => (row.timestamp ? formatTimestamp(row.timestamp) : "—") },
            ]}
          />

          {isTaxInvoice ? (
            <TableCard
              title="All Products of this Tax Invoice"
              count={taxInvoiceItems.length}
              rows={taxInvoiceItems}
              getRowKey={(row, i) => `${row.partName}-${i}`}
              onExpand={() => navigate(`/modules/${moduleKey}/${transportId}/items`)}
              columns={[
                { header: "Part Name", render: (row) => row.partName || "—" },
                { header: "Qty", render: (row) => row.qty || "—" },
                { header: "UOM", render: (row) => row.unit || "—" },
                { header: "Price", render: (row) => formatCurrency(row.price) },
                { header: "Basic Amount", render: (row) => formatCurrency(row.basicAmount) },
                { header: "Tax Amount", render: (row) => formatCurrency(row.taxAmount) },
                { header: "Total Amount", render: (row) => formatCurrency(row.totalAmount) },
                { header: "Remarks", render: (row) => row.remarks || "—" },
              ]}
            />
          ) : (
            <TableCard
              title="S.O Items Dispatches"
              count={items.length}
              rows={items}
              getRowKey={(row, i) => `${row.partNo}-${i}`}
              onExpand={() => navigate(`/modules/${moduleKey}/${transportId}/items`)}
              columns={[
                { header: "Part No.", render: (row) => row.partNo || "—" },
                { header: "Part Name", render: (row) => row.partName || "—" },
                { header: "Total Qty of Order", render: (row) => row.totalQtyOfOrder || "—" },
                { header: "Quantity", render: (row) => row.loadQty || "—" },
                { header: "Unit", render: (row) => row.unit || "—" },
                { header: "Load Boxes", render: (row) => row.loadBoxes || "—" },
              ]}
            />
          )}

          {isTaxInvoice && (
            <>
              <Section title="Billing Address">
                <Field label="Billing Address Line 1" value={snap("Billing Address Line 1")} />
                <Field label="Billing Address Line 2" value={snap("Billing Address Line 2")} />
                <Field label="Billing State" value={snap("Billing State")} />
                <Field label="Billing Pin code" value={snap("Billing Pin code")} />
                <Field label="Billing Country" value={snap("Billing Country")} />
              </Section>

              <Section title="Shipping Address">
                <Field label="Is Shipping Address Same" value={snap("Is Shipping Address Same")} />
                <Field label="Shipping Address Line 1" value={snap("Shipping Address Line 1")} />
                <Field label="Shipping Address Line 2" value={snap("Shipping Address Line 2")} />
                <Field label="Shipping State" value={snap("Shipping State")} />
                <Field label="Shipping Pin code" value={snap("Shipping Pin code")} />
                <Field label="Shipping Country" value={snap("Shipping Country")} />
              </Section>

              <Section title="Consignee Details">
                <Field label="Consignee Name" value={snap("Consignee Name")} />
                <Field label="Consignee GSTIN" value={snap("Consignee GSTIN")} />
                <Field label="Consignee Contact No." value={snap("Consignee Contact No.")} />
                <Field label="Consignee Email" value={snap("Consignee Email")} />
              </Section>
            </>
          )}
        </div>
      </div>

      {showAttach && (
        <AttachOrdersModal
          transportId={transportId!}
          onClose={() => setShowAttach(false)}
          onAttached={() => {
            setShowAttach(false);
            queryClient.invalidateQueries({ queryKey: ["trip", transportId] });
            queryClient.invalidateQueries({ queryKey: ["transport-eligible-orders"] });
          }}
        />
      )}

      {showStageForm && StageForm && stage && (
        <StageForm
          transportId={transportId!}
          onClose={() => setShowStageForm(false)}
          onSaved={() => {
            setShowStageForm(false);
            queryClient.invalidateQueries({ queryKey: ["trip", transportId] });
            queryClient.invalidateQueries({ queryKey: ["trips"] });
            navigate(`/modules/${moduleKey}`);
          }}
        />
      )}
    </div>
  );
}
