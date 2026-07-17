import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { getCustomerDetail } from "../../../lib/mastersApi";
import { getLatestOrderForCustomer } from "../../../lib/ordersApi";
import type { OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab3BillingAddress({ form, update }: Props) {
  const { data: detail } = useQuery({
    queryKey: ["masters", "customer", form.custId],
    queryFn: () => getCustomerDetail(form.custId),
    enabled: !!form.custId && form.customerType === "Existing",
  });

  // Auto-fill billing address once, when an existing customer is selected and fields are still empty.
  useEffect(() => {
    if (!detail || form.billingAddress) return;
    const billing = detail.addresses.find((a) => a["Address Type"] === "Billing") ?? detail.addresses[0];
    if (billing) {
      update({
        billingAddress: billing["Full Address"] || billing["Address Line 1"] || "",
        billingState: billing.State || "",
        billingPincode: billing["Pin Code"] || "",
        billingCountry: billing.Country || "India",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function handleShippingSameChange(value: OrderFormState["shippingSame"]) {
    if (value === "Yes") {
      update({
        shippingSame: value,
        shippingAddress: form.billingAddress,
        shippingState: form.billingState,
        shippingPincode: form.billingPincode,
      });
    } else if (value === "No") {
      update({ shippingSame: value, shippingAddress: "", shippingState: "", shippingPincode: "" });
    } else if (value === "Same as Previous Order") {
      const latest = await getLatestOrderForCustomer(form.custId);
      update({
        shippingSame: value,
        shippingAddress: latest?.SHIPPING_ADDRESS || latest?.BILLING_ADDRESS || "",
        shippingState: latest?.SHIPPING_STATE || latest?.BILLING_STATE || "",
        shippingPincode: latest?.SHIPPING_PINCODE || latest?.BILLING_PINCODE || "",
      });
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 15, marginTop: 0 }}>Billing Address</h3>
      <TextField
        label="Billing Address"
        required
        value={form.billingAddress}
        onChange={(e) => update({ billingAddress: e.target.value })}
      />
      <TextField
        label="Billing State"
        required
        value={form.billingState}
        onChange={(e) => update({ billingState: e.target.value })}
      />
      <TextField
        label="Billing Pin Code"
        required
        value={form.billingPincode}
        onChange={(e) => update({ billingPincode: e.target.value })}
      />
      <TextField
        label="Billing Country"
        value={form.billingCountry}
        onChange={(e) => update({ billingCountry: e.target.value })}
      />

      <ToggleGroup
        label="Is Shipping Address Same"
        required
        value={form.shippingSame}
        onChange={handleShippingSameChange}
        options={[
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Same as Previous Order", label: "Same as Previous Order" },
        ]}
      />

      <h3 style={{ fontSize: 15 }}>Shipping Address</h3>
      <TextField
        label="Shipping Address"
        value={form.shippingAddress}
        onChange={(e) => update({ shippingAddress: e.target.value })}
        disabled={form.shippingSame === "Yes"}
      />
      <TextField
        label="Shipping State"
        value={form.shippingState}
        onChange={(e) => update({ shippingState: e.target.value })}
        disabled={form.shippingSame === "Yes"}
      />
      <TextField
        label="Shipping Pin Code"
        value={form.shippingPincode}
        onChange={(e) => update({ shippingPincode: e.target.value })}
        disabled={form.shippingSame === "Yes"}
      />
    </div>
  );
}
