import { TextField } from "../../../components/form/TextField";
import { FileDropzone } from "../../../components/form/FileDropzone";
import { useIsMobile } from "../../../lib/responsive";
import type { OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab1PurchaseOrder({ form, update }: Props) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", columnGap: 20 }}>
      <TextField
        label="Purchase Order No."
        value={form.poNo}
        onChange={(e) => update({ poNo: e.target.value })}
      />
      <TextField
        label="Purchase Order Date"
        type="date"
        value={form.poDate}
        onChange={(e) => update({ poDate: e.target.value })}
      />
      <div style={{ gridColumn: "1 / -1" }}>
        <FileDropzone
          label="Purchase Order Attachment"
          value={form.poAttachmentUrl}
          onChange={(url) => update({ poAttachmentUrl: url })}
          context={form.poNo ? `PO_${form.poNo}` : undefined}
        />
      </div>
      <TextField
        label="Purchase Order Remarks"
        value={form.poRemarks}
        onChange={(e) => update({ poRemarks: e.target.value })}
      />
      <div style={{ gridColumn: "1 / -1" }}>
        <FileDropzone
          label="Other Order Attachment"
          value={form.otherAttachmentUrl}
          onChange={(url) => update({ otherAttachmentUrl: url })}
          context={form.poNo ? `OtherAttachment_${form.poNo}` : undefined}
        />
      </div>
    </div>
  );
}
