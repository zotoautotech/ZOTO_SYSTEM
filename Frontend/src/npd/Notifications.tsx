import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getNotifications } from "./lib/npdApi";

/** Notifications (build-prompt §8's automations: "attachment awaiting review, KYC pending,
 * price-change pending approval, low stock threshold breached"). No email/push delivery exists
 * anywhere in this codebase, so this is a live-computed "what needs attention right now" view,
 * not a persisted, markable-as-read feed — see dashboard.ts's own doc comment. */
export function Notifications() {
  const { data, isLoading } = useQuery({
    queryKey: ["npd", "dashboard", "notifications"],
    queryFn: getNotifications,
  });

  if (isLoading || !data) return <p className="text-muted" style={{ marginTop: 16 }}>Loading…</p>;

  const { pendingAttachments, pendingKyc, lowStockFg, recentPriceChanges } = data;

  return (
    <div style={{ marginTop: 16, maxWidth: 640 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Notifications</h2>

      <Section title={`Attachments awaiting review (${pendingAttachments.length})`}>
        {pendingAttachments.length === 0 ? (
          <Empty />
        ) : (
          pendingAttachments.map((a) => (
            <Row key={a.attachmentId}>
              <Link to={`/npd/projects/${a.projectId}`}>{a.docType}</Link> on {a.projectId} — needs{" "}
              {[a.needsQuality && "Quality Review", a.needsDesignHod && "Design HOD Review"].filter(Boolean).join(" & ")}
            </Row>
          ))
        )}
      </Section>

      <Section title={`KYC pending (${pendingKyc.length})`}>
        {pendingKyc.length === 0 ? (
          <Empty />
        ) : (
          pendingKyc.map((k) => (
            <Row key={k.kycId}>
              <Link to="/npd/customer-onboarding">{k.kycId}</Link> — {k.customerName}
            </Row>
          ))
        )}
      </Section>

      <Section title={`Low stock FG SKUs (${lowStockFg.length})`}>
        {lowStockFg.length === 0 ? (
          <Empty />
        ) : (
          lowStockFg.map((f) => (
            <Row key={f.fgId}>
              <Link to="/npd/dashboard">{f.name}</Link> — {f.openingStock} on hand, below min {f.minStock}
            </Row>
          ))
        )}
      </Section>

      <Section title="Recent price & BOM changes">
        {recentPriceChanges.length === 0 ? (
          <Empty />
        ) : (
          recentPriceChanges.map((e, i) => (
            <Row key={i}>
              {e.Entity} {e["Entity ID"]} — {e.Field}: {e["Old Value"] || "—"} → {e["New Value"] || "—"}
            </Row>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{title}</h3>
      <div className="card" style={{ padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>{children}</div>
  );
}

function Empty() {
  return <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Nothing here right now.</p>;
}
