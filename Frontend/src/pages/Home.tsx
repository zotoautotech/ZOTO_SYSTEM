import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listHomeTiles } from "../lib/homeApi";
import { useSearch } from "../lib/search";

/** ZOTO's app-launcher HOME screen (old AppSheet had one central HOME app that fanned out
 * to every business process as its own sub-app — After Sales, Checklist, IMS, etc.). Tiles
 * are sourced from the "ZOTO HOME" sheet (Name/View/Image/Filter columns), not hardcoded, so
 * a new row there shows up here without a deploy. "SALES CRR" is the only tile with a real
 * app behind it so far; every other tile routes to a generic "coming soon" placeholder. */
export function Home() {
  const { query } = useSearch();
  const { data: tiles = [], isLoading } = useQuery({
    queryKey: ["home", "tiles"],
    queryFn: listHomeTiles,
  });

  const filtered = tiles.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  function hrefFor(tile: { name: string; view: string }) {
    const name = tile.name.toUpperCase();
    if (name.startsWith("SALES CRR")) return "/modules";
    if (name.startsWith("CHECKLIST")) return "/checklist";
    return `/home/${encodeURIComponent(tile.view)}`;
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        {filtered.map((tile) => (
          <Link
            key={tile.view || tile.name}
            to={hrefFor(tile)}
            state={{ name: tile.name }}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              textDecoration: "none",
              color: "var(--color-text)",
            }}
          >
            {tile.image ? (
              <img src={tile.image} alt="" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 24 }}>🔧</span>
            )}
            <span style={{ fontWeight: 500 }}>{tile.name}</span>
          </Link>
        ))}
      </div>
      {!isLoading && filtered.length === 0 && (
        <p className="text-muted" style={{ marginTop: 24 }}>
          {tiles.length === 0 ? "No apps to show." : `No apps match "${query}"`}
        </p>
      )}
    </div>
  );
}
