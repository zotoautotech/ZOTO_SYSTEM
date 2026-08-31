import { Link } from "react-router-dom";

interface TileDef {
  to: string;
  name: string;
  image: string;
}

/** Product Master hub — matches the real legacy AppSheet reference screen exactly (NPD DESIGN
 * > Product Master, 5 tiles: RAW MATERIAL SKU / FINAL GOOD SKU / RM SEARCH / FG SEARCH /
 * ASSEMBLE DATA), including its real icon images — pulled directly from the live `NPD USER`
 * tab (`ZOTO/PRODUCT MASTER FG` sheet), the same Name/Image/View/Permissions pattern the
 * top-level ZOTO HOME launcher already uses (`Backend/src/routes/home.ts`). Not emoji
 * placeholders — the actual icons the reference app uses. */
const TILES: TileDef[] = [
  {
    to: "/npd/rm-sku",
    name: "RAW MATERIAL SKU",
    image: "https://cdn-icons-png.freepik.com/256/14248/14248314.png?ga=GA1.1.715346516.1729860160",
  },
  {
    to: "/npd/fg-sku",
    name: "FINAL GOOD SKU",
    image: "https://cdn-icons-png.freepik.com/256/9471/9471735.png?ga=GA1.1.715346516.1729860160",
  },
  {
    to: "/npd/rm-sku",
    name: "RM SEARCH",
    image: "https://cdn-icons-png.freepik.com/256/18389/18389987.png?ga=GA1.1.715346516.1729860160",
  },
  {
    to: "/npd/fg-sku",
    name: "FG SEARCH",
    image: "https://cdn-icons-png.freepik.com/256/17764/17764891.png?ga=GA1.1.715346516.1729860160",
  },
  {
    to: "/npd/bom",
    name: "ASSEMBLE DATA",
    image: "https://cdn-icons-png.freepik.com/256/10839/10839319.png?ga=GA1.1.2018887696.1729159453",
  },
];

export function ProductMasterHome() {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {TILES.map((tile) => (
          <Link
            key={tile.name}
            to={tile.to}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 16,
              textDecoration: "none",
              color: "var(--color-text)",
            }}
          >
            <img src={tile.image} alt="" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{tile.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
