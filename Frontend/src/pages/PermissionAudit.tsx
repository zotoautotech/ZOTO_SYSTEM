import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { listPermissionMismatches, type PermissionMismatch } from "../lib/permissionAuditApi";

/** Admin-only, read-only report of employees whose HOME tile visibility (parent — the
 * `ZOTO HOME` sheet's per-app Employee-Id allowlist) and actual app access (child — the
 * Sales CRR `USERS.Permissions_Process` column) disagree. This is exactly the class of bug
 * that cost a long debugging session: a doer could see and click into an app (parent said
 * yes) while every one of its API calls silently 403'd (child said no) — the empty state
 * that produced looked identical to a legitimate "nothing to show" result, so nobody
 * noticed until the doer reported it directly. This page exists so that drift gets caught
 * by an admin glancing at a report instead.
 *
 * Purely informational — there is deliberately no edit affordance here. Fixing a mismatch
 * still means hand-editing the relevant sheet cell, the same convention every other
 * permission column in this app already follows (see CLAUDE.md's Auth & Permissions
 * section) — this page's job is only to make drift visible, not to become a second way to
 * edit permissions. */
export function PermissionAudit() {
  const { data: mismatches = [], isLoading } = useQuery({
    queryKey: ["admin", "permission-audit"],
    queryFn: listPermissionMismatches,
  });

  const columns: Column<PermissionMismatch>[] = [
    { key: "employeeId", header: "Employee Id", render: (row) => row.employeeId },
    { key: "name", header: "Name", render: (row) => row.name || "—" },
    { key: "app", header: "App", render: (row) => row.app },
    {
      key: "issue",
      header: "Issue",
      render: (row) =>
        row.issue === "missing-child"
          ? "Sees the tile, but access is blocked once inside"
          : "Has access, but the tile isn't shown",
    },
  ];

  return (
    <div style={{ maxWidth: 900, marginTop: 24 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Permission Audit</h2>
      <p className="text-muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
        Employees whose HOME tile visibility and actual app access (Sales CRR{" "}
        <code>USERS.Permissions_Process</code>) disagree. Fix a row by editing that
        employee's permission cell directly in the sheet — there's no editor here.
      </p>
      <DataTable
        columns={columns}
        rows={mismatches}
        getRowKey={(row) => `${row.app}:${row.employeeId}`}
        emptyMessage={isLoading ? "Loading…" : "No mismatches found."}
        getRowStyle={(row) => (row.issue === "missing-child" ? { color: "var(--color-error)", fontWeight: 600 } : undefined)}
      />
    </div>
  );
}
