import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "../lib/responsive";
import { useSearch } from "../lib/search";
import { listProjects, type ProjectRecord, type ProjectStatus } from "./lib/npdApi";
import { ProjectForm } from "./ProjectForm";

const COLUMNS: ProjectStatus[] = ["Open", "In Review", "Pending Customer", "Closed"];

/** Projects Board (build-prompt §7 screen 2) — Kanban by Status. Not drag-and-drop (status
 * only ever advances through the server-enforced state machine in npdProjectStatus.ts, never
 * a manual drag), just four static columns a project's card lands in based on its own Status.
 * Filters by the header search box (project name/customer/segment). */
export function ProjectsBoard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { query } = useSearch();
  const [creating, setCreating] = useState(false);

  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: ["npd", "projects"],
    queryFn: () => listProjects(),
  });

  const filtered = query.trim()
    ? projects.filter((p) =>
        [p["Project Name"], p["Customer Name"], p.Segment].some((v) =>
          (v || "").toLowerCase().includes(query.trim().toLowerCase())
        )
      )
    : projects;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Projects</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Project
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          {COLUMNS.map((status) => {
            const items = filtered.filter((p) => p.Status === status);
            return (
              <div
                key={status}
                style={{
                  flex: isMobile ? "none" : 1,
                  width: isMobile ? "100%" : undefined,
                  minWidth: 0,
                  background: "var(--color-bg-page)",
                  borderRadius: "var(--radius)",
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                  <span>{status}</span>
                  <span className="text-muted">{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((p) => (
                    <ProjectCard key={p["Project ID"]} project={p} onClick={() => navigate(`/npd/projects/${p["Project ID"]}`)} />
                  ))}
                  {items.length === 0 && (
                    <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                      None
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            refetch();
            navigate(`/npd/projects/${id}`);
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: ProjectRecord; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick} style={{ padding: 12, cursor: "pointer" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{project["Project Name"]}</div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
        {project["Customer Name"] || "—"}
        {project.Segment ? ` · ${project.Segment}` : ""}
      </div>
      {project.Priority && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
          Priority: {project.Priority}
        </div>
      )}
    </div>
  );
}
