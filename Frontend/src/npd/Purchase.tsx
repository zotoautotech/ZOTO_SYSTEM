import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { listTaxInvoices, listStoreIn, type TaxInvoiceRecord, type StoreInRecord } from "./lib/npdApi";
import { TaxInvoiceForm } from "./TaxInvoiceForm";
import { StoreInForm } from "./StoreInForm";

/** Purchase → Goods Receipt (build-prompt §5.6, §7 screen 10). Vendor list itself lives under
 * Taxonomy (vendor-master) — this page is just the two transactional tabs: Tax Invoice entry
 * and Store In (goods receipt with QC decision). */
export function Purchase() {
  const queryClient = useQueryClient();
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [storeInFor, setStoreInFor] = useState<string | null>(null);

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["npd", "purchase", "tax-invoices"],
    queryFn: listTaxInvoices,
  });
  const { data: allStoreIn = [] } = useQuery({
    queryKey: ["npd", "purchase", "store-in"],
    queryFn: () => listStoreIn(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["npd", "purchase", "tax-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["npd", "purchase", "store-in"] });
  }

  const invoiceColumns: Column<TaxInvoiceRecord>[] = [
    { key: "id", header: "Invoice ID", render: (i) => i["Invoice ID"] },
    { key: "vendor", header: "Vendor", render: (i) => i["Vendor Name"] },
    { key: "invNo", header: "Invoice No.", render: (i) => i["Invoice No."] },
    { key: "date", header: "Date", render: (i) => i["Invoice Date"] || "—" },
    { key: "total", header: "Total Inc. Tax", render: (i) => i["Total Amount Inc Tax"] },
    { key: "storeIns", header: "Store In Entries", render: (i) => String(allStoreIn.filter((s) => s["Invoice ID"] === i["Invoice ID"]).length) },
    {
      key: "actions",
      header: "",
      render: (i) => (
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setStoreInFor(i["Invoice ID"])}>
          Store In
        </button>
      ),
    },
  ];

  const storeInColumns: Column<StoreInRecord>[] = [
    { key: "id", header: "Store In ID", render: (s) => s["Store In ID"] },
    { key: "invoice", header: "Invoice", render: (s) => s["Invoice ID"] },
    { key: "rm", header: "RM Code", render: (s) => s["RM Code"] || s["RM ID"] },
    { key: "qty", header: "Quantity", render: (s) => s.Quantity },
    { key: "qc", header: "QC Status", render: (s) => s["QC Status"] },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Upload Tax Invoice</h2>
        <button className="btn btn-primary" onClick={() => setCreatingInvoice(true)}>
          + Upload Tax Invoice
        </button>
      </div>
      <DataTable
        columns={invoiceColumns}
        rows={invoices}
        getRowKey={(i) => i["Invoice ID"]}
        emptyMessage={loadingInvoices ? "Loading…" : "No tax invoices yet."}
      />

      <h2 style={{ marginTop: 32, fontSize: 18 }}>Store In (Goods Receipt)</h2>
      <DataTable
        columns={storeInColumns}
        rows={allStoreIn}
        getRowKey={(s) => s["Store In ID"]}
        emptyMessage="No goods receipts yet."
      />

      {creatingInvoice && (
        <TaxInvoiceForm
          onClose={() => setCreatingInvoice(false)}
          onSaved={() => {
            setCreatingInvoice(false);
            refresh();
          }}
        />
      )}
      {storeInFor && (
        <StoreInForm
          invoiceId={storeInFor}
          onClose={() => setStoreInFor(null)}
          onSaved={() => {
            setStoreInFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
