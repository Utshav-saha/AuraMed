// placeholder — mock search data so results are viewable without a populated backend.
// Search the codebase for 'placeholder' to find and delete all mock-data code once
// the real database is seeded.
import type {
  MedicineResult,
  PharmacyNameResult,
  CartResult,
  AuthResponse,
  CartItemRow,
} from "./api";

// placeholder — a fake signed-in account used by the login page's "bypass" button
// so the dashboard and other pages are usable without a real backend session.
// The token is not a real JWT; backend calls that require auth will fail until a
// genuine login replaces it. Delete once real auth is wired end-to-end.
export const PLACEHOLDER_AUTH: AuthResponse = {
  access_token: "placeholder-bypass-token",
  token_type: "bearer",
  user: { id: "00000000-0000-0000-0000-000000000000", email: "amanda@auramed.dev", role: "Patient" },
  patient: { id: 1, name: "Amanda Sterling" },
};

// placeholder — 5 sample medicines (search "napa" to see them)
export const PLACEHOLDER_MEDICINES: MedicineResult[] = [
  
];

// placeholder — 5 sample pharmacies (search "green pharmacy" to see them)
export const PLACEHOLDER_PHARMACIES: PharmacyNameResult[] = [
  
];

// placeholder — names + distances for mock nearby-pharmacy results
const PLACEHOLDER_NEARBY: Array<{ id: number; name: string; distance: number }> = [
  
];

// placeholder — filter mock medicines by query, falling back to all 5 so something always shows
export function placeholderMedicineSearch(q: string): MedicineResult[] {
  const term = q.trim().toLowerCase();
  if (!term) return PLACEHOLDER_MEDICINES;
  const matches = PLACEHOLDER_MEDICINES.filter(
    (m) =>
      m.brand_name.toLowerCase().includes(term) ||
      m.generic_name.toLowerCase().includes(term)
  );
  return matches.length > 0 ? matches : PLACEHOLDER_MEDICINES;
}

// placeholder — filter mock pharmacies by name, falling back to all 5
export function placeholderPharmacyNameSearch(q: string): PharmacyNameResult[] {
  const term = q.trim().toLowerCase();
  if (!term) return PLACEHOLDER_PHARMACIES;
  const matches = PLACEHOLDER_PHARMACIES.filter((p) =>
    p.pharmacy_name.toLowerCase().includes(term)
  );
  return matches.length > 0 ? matches : PLACEHOLDER_PHARMACIES;
}

// placeholder — mock cart rows (shape of GET /cart/get_cart_items). The real
// backend cart row carries no medicine name/price, so the cart page enriches
// each row via fetchMedicineDetails; here we point at the mock medicine ids.
export const PLACEHOLDER_CART_ITEMS: CartItemRow[] = [
];

// placeholder — the backend exposes no price field at all; this is a purely
// client-side, stable pseudo-price so the order summary renders. Delete once a
// real pricing source exists.
export function placeholderPrice(medicineId: number): number {
  return Math.round((((medicineId * 37) % 90) + 10) * 100) / 100; // 10.00–99.x, stable per id
}

// placeholder — build a mock CartResult for the location page's nearby search.
// Each pharmacy "stocks" the requested medicines so result rows + cart overlay render.
export function placeholderPharmacySearch(medicineIds: number[]): CartResult {
  const stockFor = (idx: number) => 25 - idx * 3; // varied, decreasing stock

  const oneStop = PLACEHOLDER_NEARBY.map((ph) => ({
    pharmacy_id: ph.id,
    pharmacy_name: ph.name,
    distance_meters: ph.distance,
    items: medicineIds.map((mid, i) => ({
      provided_medicine_id: mid,
      is_exact: true,
      stock_count: Math.max(1, stockFor(i)),
    })),
  }));

  // For partial matches, drop the last medicine on the farther pharmacies to vary coverage
  const partial = PLACEHOLDER_NEARBY.map((ph, phIdx) => {
    const carried =
      phIdx >= 3 && medicineIds.length > 1 ? medicineIds.slice(0, -1) : medicineIds;
    return {
      pharmacy_id: ph.id,
      pharmacy_name: ph.name,
      distance_meters: ph.distance,
      available_medicines: carried.map((mid, i) => ({
        medicine_id: mid,
        stock_count: Math.max(1, stockFor(i)),
        is_exact: true,
      })),
      medicine_count: carried.length,
    };
  });

  return {
    one_stop_options: oneStop,
    multi_stop_route: [],
    partial_matches: partial,
  };
}
