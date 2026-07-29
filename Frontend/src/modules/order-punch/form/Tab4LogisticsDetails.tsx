import { useQuery } from "@tanstack/react-query";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { TextField } from "../../../components/form/TextField";
import { listTransporters, transportersToOptions } from "../../../lib/mastersApi";
import { useIsMobile } from "../../../lib/responsive";
import type { OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab4LogisticsDetails({ form, update }: Props) {
  const isMobile = useIsMobile();
  const { data: transporters = [] } = useQuery({
    queryKey: ["masters", "transporters"],
    queryFn: listTransporters,
  });
  const options = transportersToOptions(transporters);

  function handleTransporterSelect(_value: string, option?: { value: string; label: string }) {
    const row = transporters.find((t) => t["Transporter ID"] === option?.value);
    update({
      preferredTptId: option?.value ?? "",
      preferredTptName: option?.label ?? "",
      transporterType: row?.["Transporter Type"] ?? "",
      transporterContactNo: row?.["Contact No."] ?? "",
      transporterPersonName: row?.["Contact Person Name"] ?? "",
      transporterPersonContactNo: row?.["Contact Person Contact No."] ?? "",
      transporterAddress: row?.["Transporter Address"] ?? "",
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", columnGap: 20 }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <ToggleGroup
          label="Preferred Delivery Mode"
          required
          value={form.preferredDeliveryMode}
          onChange={(v) => update({ preferredDeliveryMode: v })}
          options={[
            { value: "Courier", label: "Courier" },
            { value: "Porter", label: "Porter" },
            { value: "Transporter", label: "Transporter" },
            { value: "Cust. Vehicle", label: "Cust. Vehicle" },
            { value: "Local Vehicle", label: "Local Vehicle" },
          ]}
        />
      </div>
      <ToggleGroup
        label="Preferred Transportation Mode"
        required
        value={form.preferredTransportMode}
        onChange={(v) => update({ preferredTransportMode: v })}
        options={[
          { value: "Surface", label: "Surface" },
          { value: "Air", label: "Air" },
          { value: "Water", label: "Water" },
        ]}
      />
      <ToggleGroup
        label="Freight Paid by"
        required
        value={form.freightPaidBy}
        onChange={(v) => update({ freightPaidBy: v })}
        options={[
          { value: "Seller", label: "Seller" },
          { value: "Customer", label: "Customer" },
        ]}
      />

      {form.preferredDeliveryMode === "Transporter" && (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <SearchableSelect
              label="Preferred Transporter ID"
              required
              value={form.preferredTptId}
              onChange={handleTransporterSelect}
              options={options}
              placeholder="Search transporter…"
            />
          </div>
          {form.preferredTptId && (
            <>
              <TextField label="Transporter Type" value={form.transporterType} disabled />
              <TextField label="Transporter Contact No." value={form.transporterContactNo} disabled />
              <TextField label="Transporter Person Name" value={form.transporterPersonName} disabled />
              <TextField label="Transporter Person Contact No." value={form.transporterPersonContactNo} disabled />
              <TextField label="Transporter Address" value={form.transporterAddress} disabled />
            </>
          )}
        </>
      )}
    </div>
  );
}
