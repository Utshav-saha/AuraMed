// Enrichment helpers that turn the backend's id-only cart/prescription rows into
// display-ready records. The cart and prescription endpoints return only
// `medicine_id`, so names are resolved via /medicines/fetch_medicine_details
// (with a placeholder fallback so the app stays usable without a live backend).
import { api, type CartItemRow, type Prescription, type PrescriptionLineItem } from "./api";
import {
  PLACEHOLDER_CART_ITEMS,
  PLACEHOLDER_MEDICINES,
  PLACEHOLDER_PRESCRIPTIONS,
  placeholderPrice,
} from "./placeholder";

export type MedicineDisplay = {
  brand_name: string;
  generic_name: string;
  manufacturer_name: string | null;
  strength: string | null;
};

export type EnrichedCartItem = CartItemRow & MedicineDisplay & { unit_price: number };

export type EnrichedPrescriptionItem = PrescriptionLineItem & {
  brand_name: string;
  generic_name: string;
};

export type EnrichedPrescription = Omit<Prescription, "items"> & {
  items: EnrichedPrescriptionItem[];
};

// Resolve a medicine_id to display fields. Checks the placeholder set first
// (covers guest/offline mode and avoids 404s), then the real backend.
async function resolveMedicine(
  medicineId: number,
  cache: Map<number, MedicineDisplay>
): Promise<MedicineDisplay> {
  const cached = cache.get(medicineId);
  if (cached) return cached;

  const mock = PLACEHOLDER_MEDICINES.find((m) => m.medicine_id === medicineId);
  if (mock) {
    const display: MedicineDisplay = {
      brand_name: mock.brand_name,
      generic_name: mock.generic_name,
      manufacturer_name: mock.manufacturer_name,
      strength: mock.strength,
    };
    cache.set(medicineId, display);
    return display;
  }

  try {
    const d = await api.fetchMedicineDetails(medicineId);
    const display: MedicineDisplay = {
      brand_name: d.brand_name,
      generic_name: d.generic_name ?? "—",
      manufacturer_name: d.manufacturer_name,
      strength: d.strength,
    };
    cache.set(medicineId, display);
    return display;
  } catch {
    const fallback: MedicineDisplay = {
      brand_name: `Medicine #${medicineId}`,
      generic_name: "—",
      manufacturer_name: null,
      strength: null,
    };
    cache.set(medicineId, fallback);
    return fallback;
  }
}

// Resolve real unit prices for a set of cart rows via POST /cart/calculate_total_cost.
// Falls back to the stable placeholder price when the backend can't price an item.
async function resolveUnitPrices(rows: CartItemRow[]): Promise<Map<number, number>> {
  const prices = new Map<number, number>();
  if (rows.length === 0) return prices;
  try {
    const cost = await api.calculateTotalCost(
      rows.map((r) => ({ medicine_id: r.medicine_id, count: r.count }))
    );
    cost.line_items.forEach((li) => {
      if (li.unit_price != null) prices.set(li.medicine_id, li.unit_price);
    });
  } catch {
    // no backend — placeholder fallback happens per-row below
  }
  return prices;
}

// Enrich raw cart rows with medicine display fields + a unit price.
async function enrichCartRows(rows: CartItemRow[]): Promise<EnrichedCartItem[]> {
  const cache = new Map<number, MedicineDisplay>();
  const prices = await resolveUnitPrices(rows);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      ...(await resolveMedicine(row.medicine_id, cache)),
      unit_price: prices.get(row.medicine_id) ?? placeholderPrice(row.medicine_id), // placeholder fallback
    }))
  );
}

/** Load the patient's pending cart, enriched with medicine names + unit prices. */
export async function loadEnrichedCart(patientId: number): Promise<EnrichedCartItem[]> {
  let rows: CartItemRow[];
  try {
    rows = await api.getCartItems(patientId);
    if (rows.length === 0) rows = PLACEHOLDER_CART_ITEMS; // placeholder when empty/no backend
  } catch {
    rows = PLACEHOLDER_CART_ITEMS; // placeholder
  }
  return enrichCartRows(rows);
}

/** Load the patient's past (non-pending) orders, enriched the same way as the cart. */
export async function loadEnrichedPastOrders(patientId: number): Promise<EnrichedCartItem[]> {
  let rows: CartItemRow[];
  try {
    rows = await api.pastOrders(patientId);
  } catch {
    rows = []; // no backend — past orders simply show as empty
  }
  return enrichCartRows(rows);
}

/** Load the patient's prescriptions, enriched with medicine names. */
export async function loadEnrichedPrescriptions(
  patientId: number
): Promise<EnrichedPrescription[]> {
  let list: Prescription[];
  try {
    list = await api.getPrescriptions(patientId);
  } catch {
    // 404 (no prescriptions) or no backend → placeholder
    list = PLACEHOLDER_PRESCRIPTIONS;
  }

  const cache = new Map<number, MedicineDisplay>();
  return Promise.all(
    list.map(async (p) => ({
      ...p,
      items: await Promise.all(
        p.items.map(async (it) => {
          const m = await resolveMedicine(it.medicine_id, cache);
          return { ...it, brand_name: m.brand_name, generic_name: m.generic_name };
        })
      ),
    }))
  );
}
