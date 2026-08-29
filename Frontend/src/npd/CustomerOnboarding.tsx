import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import {
  listRaiseRequests,
  listKyc,
  decideKyc,
  type RaiseRequestRecord,
  type KycRecord,
} from "./lib/npdApi";
import { RaiseRequestForm } from "./RaiseRequestForm";
import { KycForm } from "./KycForm";

/** Customer Onboarding & KYC (build-prompt §5.5, §7 screen 9's "New Customer wizard": New
 * Raise Request → KYC → Publish to Customer Master V2). Two lists on one page — Raise Requests
 * and KYC records — since both are small, low-volume draft tables; the published result lives
 * on the Customer Master Catalog under Taxonomy (customer-master-v2, reusing the same generic
 * infra as the FG/RM SKU catalogs). Approving a KYC publishes it there directly. */
export function CustomerOnboarding() {
  const queryClient = useQueryClient();
  const [creatingRaise, setCreatingRaise] = useState(false);
  const [creatingKyc, setCreatingKyc] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");

  const { data: raiseRequests = [], isLoading: loadingRaise } = useQuery({
    queryKey: ["npd", "customer", "raise-requests"],
    queryFn: listRaiseRequests,
  });
  const { data: kycRecords = [], isLoading: loadingKyc } = useQuery({
    queryKey: ["npd", "customer", "kyc"],
    queryFn: listKyc,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["npd", "customer", "raise-requests"] });
    queryClient.invalidateQueries({ queryKey: ["npd", "customer", "kyc"] });
    queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "customer-master-v2"] });
  }

  async function handleDecide(id: string, decision: "Approved" | "Rejected") {
    setActionError("");
    setActionSuccess("");
    try {
      const result = await decideKyc(id, decision, remarks || undefined);
      setDecidingId(null);
      setRemarks("");
      if (decision === "Approved" && result.customerId) {
        setActionSuccess(`KYC approved — published as ${result.customerId} in the Customer Master Catalog.`);
      }
      refresh();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not decide — please try again.");
    }
  }

  const raiseColumns: Column<RaiseRequestRecord>[] = [
    { key: "id", header: "Request ID", render: (r) => r["Request ID"] },
    { key: "name", header: "Customer Name", render: (r) => r["Customer Name"] },
    { key: "contact", header: "Contact", render: (r) => r["Contact No."] || "—" },
    { key: "credit", header: "Credit Days", render: (r) => r["Credit Days"] || "—" },
    { key: "status", header: "Status", render: (r) => r.Status },
  ];

  const kycColumns: Column<KycRecord>[] = [
    { key: "id", header: "KYC ID", render: (k) => k["KYC ID"] },
    { key: "name", header: "Customer Name", render: (k) => k["Customer Name"] },
    { key: "gstin", header: "GSTIN", render: (k) => k.GSTIN || "—" },
    { key: "status", header: "Status", render: (k) => k["KYC Status"] },
    {
      key: "actions",
      header: "",
      render: (k) =>
        k["KYC Status"] === "Pending" ? (
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setDecidingId(k["KYC ID"])}>
            Decide
          </button>
        ) : null,
    },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      {actionError && <p style={{ color: "var(--color-error)", fontSize: 13, marginBottom: 8 }}>{actionError}</p>}
      {actionSuccess && <p style={{ color: "#2E7D32", fontSize: 13, marginBottom: 8, fontWeight: 500 }}>{actionSuccess}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>New Raise Request</h2>
        <button className="btn btn-primary" onClick={() => setCreatingRaise(true)}>
          + New Raise Request
        </button>
      </div>
      <DataTable
        columns={raiseColumns}
        rows={raiseRequests}
        getRowKey={(r) => r["Request ID"]}
        emptyMessage={loadingRaise ? "Loading…" : "No raise requests yet."}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "32px 0 12px" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Customer KYC</h2>
        <button className="btn btn-primary" onClick={() => setCreatingKyc(true)}>
          + New KYC
        </button>
      </div>
      <DataTable
        columns={kycColumns}
        rows={kycRecords}
        getRowKey={(k) => k["KYC ID"]}
        emptyMessage={loadingKyc ? "Loading…" : "No KYC records yet."}
      />

      {creatingRaise && (
        <RaiseRequestForm
          onClose={() => setCreatingRaise(false)}
          onSaved={() => {
            setCreatingRaise(false);
            refresh();
          }}
        />
      )}
      {creatingKyc && (
        <KycForm
          raiseRequests={raiseRequests}
          onClose={() => setCreatingKyc(false)}
          onSaved={() => {
            setCreatingKyc(false);
            refresh();
          }}
        />
      )}

      {decidingId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}
          onClick={() => setDecidingId(null)}
        >
          <div className="card" style={{ width: 360, padding: 20, background: "var(--color-bg)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Decide KYC {decidingId}</h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks (optional)…"
              style={{
                width: "100%",
                minHeight: 70,
                padding: 10,
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setDecidingId(null)}>
                Cancel
              </button>
              <button className="btn" onClick={() => handleDecide(decidingId, "Rejected")}>
                Reject
              </button>
              <button className="btn btn-primary" onClick={() => handleDecide(decidingId, "Approved")}>
                Approve &amp; Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
