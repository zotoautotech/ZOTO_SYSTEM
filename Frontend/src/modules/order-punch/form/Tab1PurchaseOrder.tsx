import { TextField } from "../../../components/form/TextField";
import { FileDropzone } from "../../../components/form/FileDropzone";
import type { OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab1PurchaseOrder({ form, update }: Props) {
  return (
    <div>
      <TextField
        label="Purchase Order No."
        required
        value={form.poNo}
        onChange={(e) => update({ poNo: e.target.value })}
      />
      <TextField
        label="Purchase Order Date"
        required
        type="date"
        value={form.poDate}
        onChange={(e) => update({ poDate: e.target.value })}
      />
      <FileDropzone
        label="Purchase Order Attachment"
        value={form.poAttachmentUrl}
        onChange={(url) => update({ poAttachmentUrl: url })}
      />
      <TextField
        label="Purchase Order Remarks"
        value={form.poRemarks}
        onChange={(e) => update({ poRemarks: e.target.value })}
      />
      <FileDropzone
        label="Other Order Attachment"
        value={form.otherAttachmentUrl}
        onChange={(url) => update({ otherAttachmentUrl: url })}
      />
    </div>
  );
}
