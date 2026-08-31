import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { TextField } from "../components/form/TextField";
import { listTaxonomyRows, generateRmPartCode, type RmPartCodeResult } from "./lib/npdApi";

/**
 * RM Part Code Generator — the real Design-side workflow (build-prompt §5.2 corrected). Not
 * "New Part Code Request" (that's a Sales request to assign an already-existing code to a
 * customer — see partCodeRequest.ts's own doc comment). This form is what actually creates a
 * new `Raw Material SKU` row: pick Category / Sub Category / Paint / Design-By from the real
 * lookup tables, the code is assembled deterministically from what's picked (verified against
 * 714 real legacy rows, not guessed — see npdPartCode.ts).
 */
export function RmPartCodeGenerator() {
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [paintDescription, setPaintDescription] = useState("");
  const [designByLabel, setDesignByLabel] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RmPartCodeResult | null>(null);

  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category"],
    queryFn: () => listTaxonomyRows("rm-category"),
  });
  const { data: subCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category-dd"],
    queryFn: () => listTaxonomyRows("rm-category-dd"),
  });
  const { data: paintRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-paint"],
    queryFn: () => listTaxonomyRows("rm-paint"),
  });
  const { data: designByRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "part-design-by"],
    queryFn: () => listTaxonomyRows("part-design-by"),
  });

  const categoryOptions: SelectOption[] = categoryRows
    .filter((r) => r.CATEGORY && r.CODE)
    .map((r) => ({ value: r.CATEGORY, label: r.CATEGORY, subtitle: `Code: ${r.CODE}` }));

  const subCategoryOptions: SelectOption[] = subCategoryRows
    .filter((r) => r.Category === category && r["SUB CATEGORY"] && r.CODE)
    .map((r) => ({ value: r["SUB CATEGORY"], label: r["SUB CATEGORY"], subtitle: `Code: ${r.CODE}` }));

  const paintOptions: SelectOption[] = paintRows
    .filter((r) => r["Paint Description"] && r.Code)
    .map((r) => ({ value: r["Paint Description"], label: r["Paint Description"], subtitle: `Code: ${r.Code}` }));

  const designByOptions: SelectOption[] = designByRows
    .filter((r) => r["PART DESIGN BY"] && r.CODE)
    .map((r) => ({ value: r["PART DESIGN BY"], label: r["PART DESIGN BY"], subtitle: `Code: ${r.CODE}` }));

  function canGenerate() {
    return !!category && !!subCategory && !!paintDescription && !!designByLabel;
  }

  async function handleGenerate() {
    if (!canGenerate() || generating) return;
    setGenerating(true);
    setError("");
    setResult(null);
    try {
      const res = await generateRmPartCode({
        category,
        subCategory,
        paintDescription,
        designByLabel,
        vendorName: vendorName || undefined,
      });
      setResult(res);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not generate — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ marginTop: 16, maxWidth: 520 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>RM Part Code Generator</h2>
      <p className="text-muted" style={{ margin: "0 0 20px", fontSize: 13 }}>
        Code = Category + Sub-Category + running count + Paint + Design-By, in that order — verified
        against the real legacy system, not guessed. Missing a Category/Paint/Design-By option? Add it
        under Taxonomy first.
      </p>

      <SearchableSelect
        label="Category"
        required
        value={category}
        onChange={(v) => {
          setCategory(v);
          setSubCategory("");
        }}
        options={categoryOptions}
        placeholder="Search category…"
      />
      <SearchableSelect
        label="Sub Category"
        required
        value={subCategory}
        onChange={(v) => setSubCategory(v)}
        options={subCategoryOptions}
        placeholder={category ? "Search sub category…" : "Pick a Category first"}
      />
      <SearchableSelect
        label="Paint / Finish"
        required
        value={paintDescription}
        onChange={(v) => setPaintDescription(v)}
        options={paintOptions}
        placeholder="Search paint/finish…"
      />
      <SearchableSelect
        label="Design By"
        required
        value={designByLabel}
        onChange={(v) => setDesignByLabel(v)}
        options={designByOptions}
        placeholder="Search…"
      />
      <TextField label="Vendor Name (optional)" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />

      {error && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{error}</p>}

      <button className="btn btn-primary" onClick={handleGenerate} disabled={!canGenerate() || generating} style={{ marginTop: 8 }}>
        {generating ? "Generating…" : "Generate Part Code"}
      </button>

      {result && (
        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>
            New Raw Material SKU created ({result.id})
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>{result.partCode}</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            {result.categoryCode} (Category) + {result.subCategoryCode} (Sub Category) + {result.count} (count) +{" "}
            {result.paintCode} (Paint) + {result.designByDigit} (Design By)
          </div>
        </div>
      )}
    </div>
  );
}
