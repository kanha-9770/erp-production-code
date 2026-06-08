/** Demo seed records so each submodule shows realistic data on first load. */

import type { InventoryItem, InventoryMovement, SubmoduleKey } from "./types";

function base(submodule: SubmoduleKey, i: number, fields: Record<string, unknown>): InventoryItem {
  const ts = new Date(2026, 4, 1 + i, 9, 0, 0).toISOString();
  return {
    id: `seed_${submodule}_${i}`,
    submodule,
    createdAt: ts,
    updatedAt: ts,
    ...fields,
  };
}

const STORE_SEED: Array<Record<string, unknown>> = [
  { itemCode: "STK-0001", itemName: "M8 x 25 Hex Bolt", category: "Hardware", brand: "Unbrako", uom: "PC", warehouse: "JAIPUR WAREHOUSE", rackLocation: "A-12", openingStock: 500, currentStock: 420, minStock: 100, maxStock: 1000, unitRate: 4.5, status: "ACTIVE", hsnCode: "73181500" },
  { itemCode: "STK-0002", itemName: "Cutting Oil", category: "Consumable", brand: "Castrol", uom: "LTR", warehouse: "JAIPUR WAREHOUSE", rackLocation: "C-03", openingStock: 200, currentStock: 45, minStock: 50, maxStock: 300, unitRate: 180, status: "ACTIVE", hsnCode: "27101980" },
  { itemCode: "STK-0003", itemName: "Safety Gloves (Pair)", category: "PPE", brand: "Karam", uom: "PAIR", warehouse: "MUMBAI WAREHOUSE", rackLocation: "P-01", openingStock: 300, currentStock: 0, minStock: 40, maxStock: 500, unitRate: 65, status: "ACTIVE", hsnCode: "62160000" },
  { itemCode: "STK-0004", itemName: "Pneumatic Air Filter", category: "Pneumatic", brand: "Festo", uom: "PC", warehouse: "JAIPUR WAREHOUSE", rackLocation: "B-08", openingStock: 60, currentStock: 38, minStock: 10, maxStock: 80, unitRate: 1250, status: "ACTIVE", hsnCode: "84213990" },
  { itemCode: "STK-0005", itemName: "A4 Printer Paper", category: "Stationary", brand: "JK Copier", uom: "PKT", warehouse: "MUMBAI WAREHOUSE", rackLocation: "S-22", openingStock: 150, currentStock: 96, minStock: 30, maxStock: 200, unitRate: 320, status: "ACTIVE", hsnCode: "48025690" },
  { itemCode: "STK-0006", itemName: "RJ45 Connector", category: "IT", brand: "D-Link", uom: "BOX", warehouse: "JAIPUR WAREHOUSE", rackLocation: "IT-04", openingStock: 40, currentStock: 12, minStock: 15, maxStock: 60, unitRate: 450, status: "ACTIVE", hsnCode: "85366990" },
];

const MACHINE_SEED: Array<Record<string, unknown>> = [
  { itemCode: "MCH-0001", itemName: "VMC 850", machineType: "CNC", manufacturer: "BFW", modelNo: "VF30-CNC", serialNo: "BFW-22-1182", warehouse: "JAIPUR WAREHOUSE", capacity: "850x500x500", commissionDate: "2023-06-15", purchaseValue: 4500000, status: "ACTIVE" },
  { itemCode: "MCH-0002", itemName: "Lathe Machine 6ft", machineType: "Lathe", manufacturer: "HMT", modelNo: "NH26", serialNo: "HMT-19-0042", warehouse: "JAIPUR WAREHOUSE", capacity: "6 ft", commissionDate: "2019-02-10", purchaseValue: 850000, status: "MAINTENANCE" },
  { itemCode: "MCH-0003", itemName: "Hydraulic Press 100T", machineType: "Press", manufacturer: "Lakshmi", modelNo: "LP-100", serialNo: "LX-21-7781", warehouse: "MUMBAI WAREHOUSE", capacity: "100 Ton", commissionDate: "2021-11-05", purchaseValue: 1750000, status: "ACTIVE" },
  { itemCode: "MCH-0004", itemName: "Surface Grinder", machineType: "Grinding", manufacturer: "Praga", modelNo: "PSG-450", serialNo: "PR-18-3390", warehouse: "MUMBAI WAREHOUSE", capacity: "450x150", commissionDate: "2018-08-20", purchaseValue: 620000, status: "INACTIVE" },
];

const METAL_SEED: Array<Record<string, unknown>> = [
  { itemCode: "MTL-0001", itemName: "SS 304 Sheet 2mm", itemDescription: "SS 304 cold-rolled sheet, 2mm thickness", grade: "SS 304", form: "Sheet", stockType: "Plate", dimension: "2 x 1250 x 2500", uom: "SHEET", warehouse: "JAIPUR WAREHOUSE", location: "YARD-A / RACK-1", heatNo: "H-22481", currentStock: 80, minStock: 20, unitRate: 6800, status: "ACTIVE" },
  { itemCode: "MTL-0002", itemName: "MS Round Bar 25mm", itemDescription: "Mild steel round bar, Ø25mm", grade: "MS", form: "Rod", stockType: "Cylinder", dimension: "Ø25 x 6000", uom: "MTR", warehouse: "JAIPUR WAREHOUSE", location: "YARD-B / BIN-4", heatNo: "H-19002", currentStock: 12, minStock: 30, unitRate: 95, status: "ACTIVE" },
  { itemCode: "MTL-0003", itemName: "Aluminium Pipe 2in", itemDescription: "Aluminium round pipe, 2 inch", grade: "Aluminium", form: "Pipe", stockType: "Cylinder", dimension: "2in x 3000", uom: "MTR", warehouse: "MUMBAI WAREHOUSE", location: "YARD-1 / RACK-3", heatNo: "AL-7741", currentStock: 0, minStock: 25, unitRate: 410, status: "ACTIVE" },
  { itemCode: "MTL-0004", itemName: "Brass Sheet 1mm", itemDescription: "Brass sheet, 1mm thickness", grade: "Brass", form: "Sheet", stockType: "Plate", dimension: "1 x 1000 x 2000", uom: "SHEET", warehouse: "MUMBAI WAREHOUSE", location: "RACK-2 / SHELF-B", heatNo: "BR-3310", currentStock: 35, minStock: 10, unitRate: 5400, status: "ACTIVE" },
  { itemCode: "MTL-0005", itemName: "SS 316 Pipe 1in", itemDescription: "SS 316 round pipe, 1 inch", grade: "SS 316", form: "Pipe", stockType: "Cylinder", dimension: "1in x 6000", uom: "MTR", warehouse: "JAIPUR WAREHOUSE", location: "YARD-A / RACK-5", heatNo: "H-31166", currentStock: 60, minStock: 20, unitRate: 720, status: "ACTIVE" },
];

const SEED_BY_SUBMODULE: Record<SubmoduleKey, Array<Record<string, unknown>>> = {
  store: STORE_SEED,
  machine: MACHINE_SEED,
  metal: METAL_SEED,
};

export function seedItems(submodule: SubmoduleKey): InventoryItem[] {
  return SEED_BY_SUBMODULE[submodule].map((fields, i) => base(submodule, i, fields));
}

// ── Goods movement seed ─────────────────────────────────────────────────────
// Historical inward/outward log against the store items above (itemId matches
// `seed_store_<index>`). These are a pre-existing ledger, so the store items'
// `currentStock` already reflects them — seeding does NOT re-apply the deltas
// (only NEW movements created in-app adjust stock).

const MOVEMENT_SEED: Array<Omit<InventoryMovement, "id" | "createdAt" | "updatedAt">> = [
  { direction: "IN", docNo: "IN-0001", date: "2026-05-04", itemId: "seed_store_0", itemCode: "STK-0001", itemName: "M8 x 25 Hex Bolt", category: "Hardware", uom: "PC", warehouse: "JAIPUR WAREHOUSE", quantity: 500, rate: 4.5, amount: 2250, party: "Nessco Fasteners", reference: "GRN-2201", remarks: "Opening receipt" },
  { direction: "IN", docNo: "IN-0002", date: "2026-05-06", itemId: "seed_store_1", itemCode: "STK-0002", itemName: "Cutting Oil", category: "Consumable", uom: "LTR", warehouse: "JAIPUR WAREHOUSE", quantity: 200, rate: 180, amount: 36000, party: "Castrol Distributor", reference: "GRN-2208", remarks: "" },
  { direction: "OUT", docNo: "OUT-0001", date: "2026-05-09", itemId: "seed_store_0", itemCode: "STK-0001", itemName: "M8 x 25 Hex Bolt", category: "Hardware", uom: "PC", warehouse: "JAIPUR WAREHOUSE", quantity: 80, rate: 4.5, amount: 360, party: "Production", reference: "ISS-118", remarks: "Assembly line" },
  { direction: "OUT", docNo: "OUT-0002", date: "2026-05-12", itemId: "seed_store_2", itemCode: "STK-0003", itemName: "Safety Gloves (Pair)", category: "PPE", uom: "PAIR", warehouse: "MUMBAI WAREHOUSE", quantity: 60, rate: 65, amount: 3900, party: "Maintenance", reference: "ISS-122", remarks: "Monthly PPE issue" },
  { direction: "IN", docNo: "IN-0003", date: "2026-05-15", itemId: "seed_store_3", itemCode: "STK-0004", itemName: "Pneumatic Air Filter", category: "Pneumatic", uom: "PC", warehouse: "JAIPUR WAREHOUSE", quantity: 40, rate: 1250, amount: 50000, party: "Festo India", reference: "GRN-2231", remarks: "" },
  { direction: "OUT", docNo: "OUT-0003", date: "2026-05-18", itemId: "seed_store_5", itemCode: "STK-0006", itemName: "RJ45 Connector", category: "IT", uom: "BOX", warehouse: "JAIPUR WAREHOUSE", quantity: 8, rate: 450, amount: 3600, party: "IT Department", reference: "ISS-130", remarks: "Networking" },
];

export function seedMovements(): InventoryMovement[] {
  return MOVEMENT_SEED.map((m, i) => {
    const ts = new Date(2026, 4, 4 + i, 10, 0, 0).toISOString();
    return { ...m, id: `seed_mov_${i}`, createdAt: ts, updatedAt: ts };
  });
}
