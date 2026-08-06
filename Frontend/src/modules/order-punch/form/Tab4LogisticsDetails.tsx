import { useQuery } from "@tanstack/react-query";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { TextField } from "../../../components/form/TextField";
import { listTransporters, transportersToOptions, listZotoVehicles, zotoVehiclesToOptions } from "../../../lib/mastersApi";
import type { OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab4LogisticsDetails({ form, update }: Props) {
  const { data: transporters = [] } = useQuery({
    queryKey: ["masters", "transporters"],
    queryFn: listTransporters,
  });
  const options = transportersToOptions(transporters);

  const { data: zotoVehicles = [] } = useQuery({
    queryKey: ["masters", "zoto-vehicles"],
    queryFn: listZotoVehicles,
  });
  const zotoVehicleOptions = zotoVehiclesToOptions(zotoVehicles);

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

  // "ZOTO Vehicle" Preferred Delivery Mode — pick one of ZOTO's own vehicles by ID and
  // auto-fill its type/number/size/driver details, same pattern as handleTransporterSelect.
  function handleZotoVehicleSelect(value: string) {
    const row = zotoVehicles.find((v) => v["zoto vehical id"] === value);
    update({
      preferredZotoVehicleId: value,
      zotoVehicleDetails: row?.["Zoto Vehicle Details"] ?? "",
      zotoVehicleType: row?.["Vehicle type"] ?? "",
      zotoVehicleNo: row?.["Vehicle No."] ?? "",
      zotoVehicleSize: row?.["Vehicle Size (Ft)"] ?? "",
      zotoVehicleDriverName: row?.["Driver Name"] ?? "",
      zotoVehicleDriverContactNo: row?.["Driver Contact No."] ?? "",
    });
  }

  return (
    <div>
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
          { value: "ZOTO Vehicle", label: "ZOTO Vehicle" },
        ]}
      />
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
          <SearchableSelect
            label="Preferred Transporter ID"
            required
            value={form.preferredTptId}
            onChange={handleTransporterSelect}
            options={options}
            placeholder="Search transporter…"
          />
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

      {form.preferredDeliveryMode === "ZOTO Vehicle" && (
        <>
          <SearchableSelect
            label="Preferred ZOTO Vehicle ID"
            required
            value={form.preferredZotoVehicleId}
            onChange={handleZotoVehicleSelect}
            options={zotoVehicleOptions}
            placeholder="Search ZOTO vehicle…"
          />
          {form.preferredZotoVehicleId && (
            <>
              <TextField label="Vehicle Type" value={form.zotoVehicleType} disabled />
              <TextField label="Vehicle No." value={form.zotoVehicleNo} disabled />
              <TextField label="Vehicle Size (Ft)" value={form.zotoVehicleSize} disabled />
              <TextField label="Driver Name" value={form.zotoVehicleDriverName} disabled />
              <TextField label="Driver Contact No." value={form.zotoVehicleDriverContactNo} disabled />
            </>
          )}
        </>
      )}
    </div>
  );
}
