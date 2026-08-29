import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { listPartCodeRequests, approvePartCodeRequest, rejectPartCodeRequest, type PartCodeRequestRecord } from "./lib/npdApi";
import { PartCodeRequestForm } from "./PartCodeRequestForm";

/** New Part Code Request queue (build-prompt §5.2, §7 screen 7). Approve/Reject actions are
 * shown to everyone — the real gate is server-side (Design/Admin only, npdPermissions.ts), so a
 * doer without that role just gets a 403 shown inline, same "form check is UX-only" convention
 * used throughout this app. No separate funnel chart yet (the build prompt's "Part Code Request
 * Graph") — Status alone (Requested/Approved/Rejected) covers the essential tracking for now. */
export function PartCodeRequestList() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["npd", "part-code-requests"],
    queryFn: () => listPartCodeRequests(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["npd", "part-code-requests"] });
  }

  async function handleApprove(id: string) {
    setActionError("");
    setActionSuccess("");
    try {
      const result = await approvePartCodeRequest(id);
      setActionSuccess(`${id} approved — new Part Code: ${result.partCode}`);
      refresh();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not approve — please try again.");
    }
  }

  async function handleReject(id: string) {
    if (!rejectNote.trim()) return;
    setActionError("");
    try {
      await rejectPartCodeRequest(id, rejectNote.trim());
      setRejectingId(null);
      setRejectNote("");
      refresh();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not reject — please try again.");
    }
  }

  const columns: Column<PartCodeRequestRecord>[] = [
    { key: "id", header: "Request ID", render: (r) => r["Part Request ID"] },
    { key: "type", header: "Type", render: (r) => r["Part Type"] },
    { key: "category", header: "Category", render: (r) => `${r.Category} / ${r["Sub Category"]}` },
    { key: "name", header: "Part Name", render: (r) => r["Part Name"] },
    { key: "customer", header: "Customer", render: (r) => r["Customer Name"] || "—" },
    { key: "status", header: "Status", render: (r) => r.Status },
    { key: "code", header: "Part Code", render: (r) => r["Part Code"] || "—" },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.Status === "Requested" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handleApprove(r["Part Request ID"])}>
              Approve
            </button>
            <button
              className="btn"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => {
                setRejectingId(r["Part Request ID"]);
                setRejectNote("");
              }}
            >
              Reject
            </button>
          </div>
        ) : (
          r["Assign Note"] || null
        ),
    },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>New Part Code Request</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Request
        </button>
      </div>
      {actionError && <p style={{ color: "var(--color-error)", fontSize: 13, marginBottom: 8 }}>{actionError}</p>}
      {actionSuccess && (
        <p style={{ color: "var(--color-primary)", fontSize: 13, marginBottom: 8, fontWeight: 500 }}>{actionSuccess}</p>
      )}
      <DataTable
        columns={columns}
        rows={requests}
        getRowKey={(r) => r["Part Request ID"]}
        emptyMessage={isLoading ? "Loading…" : "No part code requests yet."}
      />

      {creating && (
        <PartCodeRequestForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {rejectingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
          onClick={() => setRejectingId(null)}
        >
          <div
            className="card"
            style={{ width: 360, padding: 20, background: "var(--color-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Reject Request</h3>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason…"
              style={{
                width: "100%",
                minHeight: 80,
                padding: 10,
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setRejectingId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!rejectNote.trim()} onClick={() => handleReject(rejectingId)}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
