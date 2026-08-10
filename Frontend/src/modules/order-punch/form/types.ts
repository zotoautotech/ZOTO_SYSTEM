export interface ItemFormState {
  partType: "Existing" | "New" | "";
  fgId: string;
  partNo: string;
  partName: string;
  segment: string;
  category: string;
  qty: number | undefined;
  uom: string;
  price: number | undefined;
  gstSlabPct: number | undefined;
  remarks: string;
}

export function emptyItem(): ItemFormState {
  return {
    partType: "",
    fgId: "",
    partNo: "",
    partName: "",
    segment: "",
    category: "",
    qty: undefined,
    uom: "SET",
    price: undefined,
    gstSlabPct: 18,
    remarks: "",
  };
}

/** Rehydrates a saved order (ORDER_PUNCH row + its ORDER_ITEMS) back into form state so the
 * punch form can reopen it for editing. The inverse of the payload OrderPunchForm sends on
 * save — anything the form doesn't own (amounts, status, seller/buyer snapshot fields) is
 * deliberately left out, since the server recomputes or preserves those itself. */
export function orderToFormState(
  order: Record<string, string | undefined>,
  items: Record<string, string | undefined>[]
): OrderFormState {
  const str = (v: string | undefined) => v ?? "";
  const num = (v: string | undefined) => {
    const n = Number(v);
    return v === undefined || v === "" || !Number.isFinite(n) ? undefined : n;
  };
  return {
    ...emptyOrderForm(),
    poNo: str(order.PO_NO),
    poDate: str(order.PO_DATE),
    poAttachmentUrl: str(order.PO_ATTACHMENT_URL),
    otherAttachmentUrl: str(order.OTHER_ATTACHMENT_URL),
    poRemarks: str(order.PO_REMARKS),
    saleType: (str(order.SALE_TYPE) || "Order") as OrderFormState["saleType"],
    orderType: (str(order.ORDER_TYPE) || "Order Incoming") as OrderFormState["orderType"],
    paymentType: (str(order.PAYMENT_TYPE) || "Credit") as OrderFormState["paymentType"],
    advancePct: num(order.ADVANCE_PCT),
    customerType: "Existing",
    custId: str(order.CUST_ID),
    customerName: str(order.CUSTOMER_NAME),
    // Reconstructed from the order's own saved Sale Staff Name so the assignment check
    // behaves the same on an edit as it does on a fresh punch.
    custAssignedTo: str(order.SALE_STAFF_NAME),
    buyerGstin: str(order.BUYER_GSTIN),
    clientClassification: str(order.CLIENT_CLASSIFICATION) as OrderFormState["clientClassification"],
    items:
      items.length > 0
        ? items.map((it) => ({
            partType: "Existing" as const,
            fgId: str(it.FG_ID),
            partNo: str(it.PART_NO),
            partName: str(it.PART_NAME),
            segment: str(it.SEGMENT),
            category: str(it.CATEGORY),
            qty: num(it.QTY),
            uom: str(it.UOM) || "SET",
            price: num(it.PRICE),
            gstSlabPct: num(it.GST_SLAB_PCT) ?? 18,
            remarks: str(it.NOTES),
          }))
        : [emptyItem()],
    billingAddress: str(order.BILLING_ADDRESS),
    billingState: str(order.BILLING_STATE),
    billingPincode: str(order.BILLING_PINCODE),
    billingCountry: str(order.BILLING_COUNTRY) || "India",
    // SHIPPING_SAME and IS_SHIPPING_SAME share one sheet column ("Is Shipping Address
    // Same"), and reads come back under whichever the reverse map picked as canonical —
    // accept either, or the field silently arrives blank and Tab 3 refuses to advance.
    shippingSame: (str(order.SHIPPING_SAME) || str(order.IS_SHIPPING_SAME)) as OrderFormState["shippingSame"],
    shippingAddress: str(order.SHIPPING_ADDRESS),
    shippingState: str(order.SHIPPING_STATE),
    shippingPincode: str(order.SHIPPING_PINCODE),
    preferredDeliveryMode: str(order.PREFERRED_DELIVERY_MODE),
    preferredTransportMode: str(order.PREFERRED_TRANSPORT_MODE),
    freightPaidBy: str(order.FREIGHT_PAID_BY),
    freightOnInvoice: str(order.FREIGHT_ON_INVOICE) as OrderFormState["freightOnInvoice"],
    preferredTptId: str(order.PREFERRED_TPT_ID),
    preferredTptName: str(order.PREFERRED_TPT_NAME),
    transporterType: str(order.TRANSPORTER_TYPE),
    transporterContactNo: str(order.TRANSPORTER_CONTACT),
    transporterPersonName: str(order.TRANSPORTER_PERSON_NAME),
    transporterPersonContactNo: str(order.TRANSPORTER_PERSON_CONTACT),
    transporterAddress: str(order.TRANSPORTER_ADDRESS),
    preferredZotoVehicleId: str(order.PREFERRED_ZOTO_VEHICLE_ID),
    zotoVehicleDetails: str(order.ZOTO_VEHICLE_DETAILS),
    zotoVehicleType: str(order.ZOTO_VEHICLE_TYPE),
    zotoVehicleNo: str(order.ZOTO_VEHICLE_NO),
    zotoVehicleSize: str(order.ZOTO_VEHICLE_SIZE),
    zotoVehicleDriverName: str(order.ZOTO_VEHICLE_DRIVER_NAME),
    zotoVehicleDriverContactNo: str(order.ZOTO_VEHICLE_DRIVER_CONTACT),
  };
}

export interface OrderFormState {
  // Tab 1
  poNo: string;
  poDate: string;
  poAttachmentUrl: string;
  otherAttachmentUrl: string;
  poRemarks: string;

  // Tab 2 — order level
  saleType: "Order" | "Sample" | "Return Order" | "";
  orderType: "Order Incoming" | "Order Outgoing" | "";
  paymentType: "Credit" | "Advance" | "";
  advancePct: number | undefined;

  // Tab 2 — buyer
  customerType: "Existing" | "New" | "";
  custId: string;
  customerName: string;
  // The doer this customer is assigned to (CUSTOMER MASTER's "Field Sale Repersentative").
  // Carried on form state purely so validateTab() can block a punch for someone else's
  // customer without needing the whole customer list — POST /orders enforces it for real.
  custAssignedTo: string;
  buyerGstin: string;
  clientClassification: "Existing" | "New" | "Prospective" | "";

  // Tab 2 — items
  items: ItemFormState[];

  // Tab 3
  billingAddress: string;
  billingState: string;
  billingPincode: string;
  billingCountry: string;
  shippingSame: "Yes" | "No" | "Same as Previous Order" | "";
  shippingAddress: string;
  shippingState: string;
  shippingPincode: string;

  // Tab 4
  preferredDeliveryMode: string;
  preferredTransportMode: string;
  freightPaidBy: string;
  freightOnInvoice: "Yes" | "No" | "";
  preferredTptId: string;
  preferredTptName: string;
  transporterType: string;
  transporterContactNo: string;
  transporterPersonName: string;
  transporterPersonContactNo: string;
  transporterAddress: string;
  preferredZotoVehicleId: string;
  zotoVehicleDetails: string;
  zotoVehicleType: string;
  zotoVehicleNo: string;
  zotoVehicleSize: string;
  zotoVehicleDriverName: string;
  zotoVehicleDriverContactNo: string;
}

export function emptyOrderForm(): OrderFormState {
  return {
    poNo: "",
    poDate: "",
    poAttachmentUrl: "",
    otherAttachmentUrl: "",
    poRemarks: "",
    saleType: "Order",
    orderType: "Order Incoming",
    paymentType: "Credit",
    advancePct: undefined,
    customerType: "",
    custId: "",
    customerName: "",
    custAssignedTo: "",
    buyerGstin: "",
    clientClassification: "",
    items: [emptyItem()],
    billingAddress: "",
    billingState: "",
    billingPincode: "",
    billingCountry: "India",
    shippingSame: "",
    shippingAddress: "",
    shippingState: "",
    shippingPincode: "",
    // Defaults per user request: most doer orders go out on ZOTO's own vehicle, paid by
    // the seller — Tab4LogisticsDetails auto-fills the ZOTO Vehicle detail fields below
    // once the vehicle master loads (see its own effect), rather than hardcoding VEH-001's
    // actual details here, so this stays correct if the sheet data ever changes.
    preferredDeliveryMode: "ZOTO Vehicle",
    preferredTransportMode: "Surface",
    freightPaidBy: "Seller",
    freightOnInvoice: "No",
    preferredTptId: "",
    preferredTptName: "",
    transporterType: "",
    transporterContactNo: "",
    transporterPersonName: "",
    transporterPersonContactNo: "",
    transporterAddress: "",
    preferredZotoVehicleId: "VEH-001",
    zotoVehicleDetails: "",
    zotoVehicleType: "",
    zotoVehicleNo: "",
    zotoVehicleSize: "",
    zotoVehicleDriverName: "",
    zotoVehicleDriverContactNo: "",
  };
}
