/**
 * Static field schemas + seed master data for the Inventory System.
 *
 * Store Inventory's fields are declared statically here (as requested), but the
 * dropdown VALUES (category, unit, warehouse) are NOT hard-coded into the form
 * — they come from the master registry below, which is managed from the
 * Inventory Master page. That separation is the whole point: fields are static,
 * their option lists are master-driven and editable ERP-wide.
 */

import type { MasterType, SubmoduleSchema, SubmoduleKey } from "./types";

// ── Seed master dropdowns ───────────────────────────────────────────────────
// Values mirror the dropdowns from the source spreadsheet (Category / Unit /
// Warehouse) plus a few masters the machine & metal submodules consume.

function opts(values: string[]): MasterType["options"] {
  return values.map((value, i) => ({
    id: `seed-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    value,
    active: true,
    sortOrder: i,
  }));
}

export const SEED_MASTERS: MasterType[] = [
  {
    key: "category",
    label: "Category",
    description: "Item classification used across the store inventory.",
    icon: "tags",
    usedBy: ["store"],
    system: true,
    options: opts([
      "Hardware",
      "Mechanical",
      "Electrical",
      "Pneumatic",
      "Hydraulic",
      "Consumable",
      "PPE",
      "Tool",
      "Stationary",
      "Raw Material",
      "IT",
    ]),
  },
  {
    key: "uom",
    label: "Unit of Measure",
    description: "Stocking / issuing unit for an item.",
    icon: "ruler",
    usedBy: ["store", "metal"],
    system: true,
    options: opts([
      "BAG",
      "BOX",
      "DOZEN",
      "FT",
      "GRAMS",
      "KG",
      "LTR",
      "ML",
      "MM",
      "MTR",
      "PAIR",
      "PC",
      "PKT",
      "ROLL",
      "SERVICE",
      "SET",
      "SHEET",
      "SQFT",
    ]),
  },
  {
    key: "warehouse",
    label: "Warehouse",
    description: "Physical storage location / godown.",
    icon: "warehouse",
    usedBy: ["store", "machine", "metal"],
    system: true,
    options: opts(["JAIPUR WAREHOUSE", "MUMBAI WAREHOUSE"]),
  },
  {
    key: "machine_type",
    label: "Machine Type",
    description: "Classification of plant & machinery.",
    icon: "cog",
    usedBy: ["machine"],
    options: opts(["CNC", "Lathe", "Milling", "Drilling", "Grinding", "Press", "Welding"]),
  },
  {
    key: "metal_grade",
    label: "Metal Grade",
    description: "Material grade for metal stock.",
    icon: "layers",
    usedBy: ["metal"],
    options: opts([
      "MS",
      "SS 304",
      "SS 316",
      "Aluminium",
      "Brass",
      "Copper",
      "Cast Iron",
      "EN8",
      "EN31",
      "D2",
      "H13",
      "CHROME ROD",
      "EN18",
      "EN19",
      "EN24",
      "ALUMINIUM 6061",
    ]),
  },
  {
    key: "metal_form",
    label: "Metal Form",
    description: "Physical form / shape of the metal stock.",
    icon: "shapes",
    usedBy: ["metal"],
    options: opts(["Sheet", "Plate", "Rod", "Pipe", "Coil", "Wire", "Angle", "Channel"]),
  },
];

// ── Submodule field schemas ─────────────────────────────────────────────────

export const STORE_SCHEMA: SubmoduleSchema = {
  key: "store",
  label: "Store Inventory",
  icon: "boxes",
  itemNoun: "item",
  route: "store-inventory",
  codePrefix: "STK",
  fields: [
    { key: "image", label: "Image", type: "image", section: "Identity", inTable: true, pinned: true, width: 60 },
    { key: "itemCode", label: "Item Code", type: "text", section: "Identity", required: true, inTable: true, width: 130, placeholder: "Auto / manual" },
    { key: "itemName", label: "Item Name", type: "text", section: "Identity", required: true, inTable: true, pinned: true, width: 240, placeholder: "e.g. M8 Hex Bolt" },
    { key: "itemDescription", label: "Item Description", type: "text", section: "Identity", inTable: true, width: 260, placeholder: "Short description of the item" },
    { key: "category", label: "Category", type: "master", master: "category", section: "Identity", required: true, inTable: true, width: 150 },
    { key: "brand", label: "Brand / Make", type: "text", section: "Identity", inTable: true, defaultHidden: true, width: 140 },
    { key: "hsnCode", label: "HSN Code", type: "text", section: "Identity", defaultHidden: true, inTable: true, width: 120 },

    { key: "uom", label: "Unit (UOM)", type: "master", master: "uom", section: "Stock", required: true, inTable: true, width: 110 },
    { key: "warehouse", label: "Warehouse", type: "master", master: "warehouse", section: "Stock", required: true, inTable: true, width: 180 },
    { key: "rackLocation", label: "Rack / Bin", type: "text", section: "Stock", defaultHidden: true, inTable: true, width: 120, placeholder: "A-12" },
    { key: "openingStock", label: "Opening Stock", type: "number", section: "Stock", defaultValue: 0, defaultHidden: true, inTable: true, width: 120, align: "right" },
    { key: "currentStock", label: "Current Stock", type: "number", section: "Stock", defaultValue: 0, inTable: true, width: 120, align: "right" },
    { key: "minStock", label: "Reorder Level", type: "number", section: "Stock", defaultValue: 0, inTable: true, width: 120, align: "right" },
    { key: "maxStock", label: "Max Stock", type: "number", section: "Stock", defaultValue: 0, defaultHidden: true, inTable: true, width: 110, align: "right" },

    { key: "unitRate", label: "Unit Rate", type: "currency", section: "Costing", defaultValue: 0, inTable: true, width: 130, align: "right" },
    { key: "status", label: "Status", type: "status", section: "Costing", inTable: true, width: 130 },
    { key: "description", label: "Description / Specs", type: "textarea", section: "Costing", placeholder: "Specifications, notes…" },
  ],
};

export const MACHINE_SCHEMA: SubmoduleSchema = {
  key: "machine",
  label: "Machine Inventory",
  icon: "cog",
  itemNoun: "machine",
  route: "machine-inventory",
  codePrefix: "MCH",
  fields: [
    { key: "image", label: "Image", type: "image", section: "Identity", inTable: true, pinned: true, width: 60 },
    { key: "itemCode", label: "Machine Code", type: "text", section: "Identity", required: true, inTable: true, width: 140 },
    { key: "itemName", label: "Machine Name", type: "text", section: "Identity", required: true, inTable: true, pinned: true, width: 240 },
    { key: "machineType", label: "Machine Type", type: "master", master: "machine_type", section: "Identity", required: true, inTable: true, width: 150 },
    { key: "manufacturer", label: "Manufacturer", type: "text", section: "Identity", inTable: true, width: 160 },
    { key: "modelNo", label: "Model No.", type: "text", section: "Identity", defaultHidden: true, inTable: true, width: 140 },
    { key: "serialNo", label: "Serial No.", type: "text", section: "Identity", defaultHidden: true, inTable: true, width: 140 },

    { key: "warehouse", label: "Location", type: "master", master: "warehouse", section: "Deployment", required: true, inTable: true, width: 180 },
    { key: "capacity", label: "Capacity / Rating", type: "text", section: "Deployment", defaultHidden: true, inTable: true, width: 150, placeholder: "e.g. 5 HP" },
    { key: "commissionDate", label: "Commission Date", type: "date", section: "Deployment", defaultHidden: true, inTable: true, width: 140 },

    { key: "purchaseValue", label: "Purchase Value", type: "currency", section: "Costing", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "status", label: "Status", type: "select", section: "Costing", inTable: true, width: 140, options: [
      { value: "ACTIVE", label: "Active" },
      { value: "MAINTENANCE", label: "Under Maintenance" },
      { value: "INACTIVE", label: "Idle" },
      { value: "RETIRED", label: "Retired" },
    ] },
    { key: "description", label: "Notes", type: "textarea", section: "Costing", placeholder: "Maintenance notes, specs…" },
  ],
};

export const METAL_SCHEMA: SubmoduleSchema = {
  key: "metal",
  label: "Metal Inventory",
  icon: "layers",
  itemNoun: "metal stock",
  route: "metal-inventory",
  codePrefix: "MTL",
  fields: [
    { key: "image", label: "Image", type: "image", section: "Identity", inTable: true, pinned: true, width: 60 },
    { key: "itemCode", label: "Item Code", type: "text", section: "Identity", required: true, inTable: true, width: 140 },
    { key: "itemName", label: "Item Name", type: "text", section: "Identity", required: true, inTable: true, pinned: true, width: 220, placeholder: "e.g. SS 304 Sheet" },
    { key: "itemDescription", label: "Item Description", type: "text", section: "Identity", inTable: true, width: 260, placeholder: "e.g. SS 304 cold-rolled sheet 2mm" },
    { key: "grade", label: "Grade", type: "master", master: "metal_grade", section: "Identity", required: true, inTable: true, width: 130 },
    { key: "form", label: "Form", type: "master", master: "metal_form", section: "Identity", required: true, inTable: true, width: 120 },
    { key: "dimension", label: "Dimension / Size", type: "text", section: "Identity", inTable: true, defaultHidden: true, width: 150, placeholder: "2mm x 1250 x 2500" },

    { key: "uom", label: "Unit (UOM)", type: "master", master: "uom", section: "Stock", required: true, inTable: true, width: 110 },
    { key: "warehouse", label: "Warehouse", type: "master", master: "warehouse", section: "Stock", required: true, inTable: true, width: 180 },
    { key: "location", label: "Location", type: "text", section: "Stock", inTable: true, width: 150, placeholder: "Yard / Rack / Bin" },
    { key: "heatNo", label: "Heat / Batch No.", type: "text", section: "Stock", defaultHidden: true, inTable: true, width: 140 },
    { key: "currentStock", label: "Quantity", type: "number", section: "Stock", defaultValue: 0, inTable: true, width: 110, align: "right" },
    { key: "minStock", label: "Reorder Level", type: "number", section: "Stock", defaultValue: 0, inTable: true, width: 120, align: "right" },

    { key: "unitRate", label: "Rate / Unit", type: "currency", section: "Costing", defaultValue: 0, inTable: true, width: 130, align: "right" },
    { key: "status", label: "Status", type: "status", section: "Costing", inTable: true, width: 130 },
    { key: "description", label: "Remarks", type: "textarea", section: "Costing" },
  ],
};

export const SUBMODULE_SCHEMAS: Record<SubmoduleKey, SubmoduleSchema> = {
  store: STORE_SCHEMA,
  machine: MACHINE_SCHEMA,
  metal: METAL_SCHEMA,
};

export const SUBMODULE_ORDER: SubmoduleKey[] = ["store", "machine", "metal"];

export function getSchema(key: SubmoduleKey): SubmoduleSchema {
  return SUBMODULE_SCHEMAS[key];
}
