/** Demo seed records so each submodule shows realistic data on first load. */

import type { InventoryItem, SubmoduleKey } from "./types";

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
  { itemCode: "MTL-0001", itemName: "SS 304 Sheet 2mm", grade: "SS 304", form: "Sheet", dimension: "2 x 1250 x 2500", uom: "SHEET", warehouse: "JAIPUR WAREHOUSE", heatNo: "H-22481", currentStock: 80, minStock: 20, unitRate: 6800, status: "ACTIVE" },
  { itemCode: "MTL-0002", itemName: "MS Round Bar 25mm", grade: "MS", form: "Rod", dimension: "Ø25 x 6000", uom: "MTR", warehouse: "JAIPUR WAREHOUSE", heatNo: "H-19002", currentStock: 12, minStock: 30, unitRate: 95, status: "ACTIVE" },
  { itemCode: "MTL-0003", itemName: "Aluminium Pipe 2in", grade: "Aluminium", form: "Pipe", dimension: "2in x 3000", uom: "MTR", warehouse: "MUMBAI WAREHOUSE", heatNo: "AL-7741", currentStock: 0, minStock: 25, unitRate: 410, status: "ACTIVE" },
  { itemCode: "MTL-0004", itemName: "Brass Sheet 1mm", grade: "Brass", form: "Sheet", dimension: "1 x 1000 x 2000", uom: "SHEET", warehouse: "MUMBAI WAREHOUSE", heatNo: "BR-3310", currentStock: 35, minStock: 10, unitRate: 5400, status: "ACTIVE" },
  { itemCode: "MTL-0005", itemName: "SS 316 Pipe 1in", grade: "SS 316", form: "Pipe", dimension: "1in x 6000", uom: "MTR", warehouse: "JAIPUR WAREHOUSE", heatNo: "H-31166", currentStock: 60, minStock: 20, unitRate: 720, status: "ACTIVE" },
];

const SEED_BY_SUBMODULE: Record<SubmoduleKey, Array<Record<string, unknown>>> = {
  store: STORE_SEED,
  machine: MACHINE_SEED,
  metal: METAL_SEED,
};

export function seedItems(submodule: SubmoduleKey): InventoryItem[] {
  return SEED_BY_SUBMODULE[submodule].map((fields, i) => base(submodule, i, fields));
}
