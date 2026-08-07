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
