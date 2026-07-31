import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrip } from "../../lib/tripsApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";
import { getTripStage } from "../../lib/tripStages";
import { AttachOrdersModal } from "./AttachOrdersModal";
import { ReachedForm } from "./forms/ReachedForm";
import { StockReleaseForm } from "./forms/StockReleaseForm";
import { TaxInvoiceForm } from "./forms/TaxInvoiceForm";
import { DispatchForm } from "./forms/DispatchForm";
import { LRForm } from "./forms/LRForm";
import { DeliveryForm } from "./forms/DeliveryForm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
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

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", width: 90 }}
    >
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <span style={{ fontSize: 12, color: "var(--color-text)", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </button>
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

  const { transport, orders } = data;
  const stage = getTripStage(moduleKey);
  const StageForm = stage ? STAGE_FORM_BY_KEY[stage.key] : undefined;
  const canGiveStageForm = !!stage && transport.Status === stage.prevStatus;
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
          <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            {canAttachOrders && <QuickAction label="Attach Orders" onClick={() => setShowAttach(true)} />}
            {canGiveStageForm && <QuickAction label={`Give ${stage!.label} Form`} onClick={() => setShowStageForm(true)} />}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
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
          </Section>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <Section title={`Attached Orders (${orders.length})`}>
            {orders.length === 0 && <p className="text-muted">No orders attached yet.</p>}
            {orders.map((o) => (
              <div
                key={o.ORDER_ID}
                onClick={() => navigate(`/modules/punch-order/${o.ORDER_ID}`)}
                style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.CUSTOMER_NAME || o.ORDER_ID}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {o.ORDER_ID} · ₹{Number(o.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </Section>
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
