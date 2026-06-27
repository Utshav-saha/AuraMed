// placeholder — mock search data so results are viewable without a populated backend.
// Search the codebase for 'placeholder' to find and delete all mock-data code once
// the real database is seeded.
import type { MedicineResult, PharmacyNameResult, CartResult, AuthResponse } from "./api";

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
  { medicine_id: 9001, brand_name: "Napa", strength: "500mg", manufacturer_name: "Beximco Pharmaceuticals", generic_name: "Paracetamol", similarity: 0.98 },
  { medicine_id: 9002, brand_name: "Napa Extra", strength: "500mg + 65mg", manufacturer_name: "Beximco Pharmaceuticals", generic_name: "Paracetamol + Caffeine", similarity: 0.94 },
  { medicine_id: 9003, brand_name: "Ace", strength: "500mg", manufacturer_name: "Square Pharmaceuticals", generic_name: "Paracetamol", similarity: 0.9 },
  { medicine_id: 9004, brand_name: "Histacin", strength: "10mg", manufacturer_name: "Square Pharmaceuticals", generic_name: "Cetirizine Hydrochloride", similarity: 0.82 },
  { medicine_id: 9005, brand_name: "Maxpro", strength: "20mg", manufacturer_name: "Renata Limited", generic_name: "Esomeprazole", similarity: 0.78 },
];

// placeholder — 5 sample pharmacies (search "green pharmacy" to see them)
export const PLACEHOLDER_PHARMACIES: PharmacyNameResult[] = [
  { pharmacy_id: 9001, pharmacy_name: "Green Pharmacy" },
  { pharmacy_id: 9002, pharmacy_name: "Lazz Pharma" },
  { pharmacy_id: 9003, pharmacy_name: "Tamanna Pharmacy" },
  { pharmacy_id: 9004, pharmacy_name: "Wellness Pharma" },
  { pharmacy_id: 9005, pharmacy_name: "City Care Pharmacy" },
];

// placeholder — names + distances for mock nearby-pharmacy results
const PLACEHOLDER_NEARBY: Array<{ id: number; name: string; distance: number }> = [
  { id: 9001, name: "Green Pharmacy", distance: 420 },
  { id: 9002, name: "Lazz Pharma", distance: 980 },
  { id: 9003, name: "Tamanna Pharmacy", distance: 1450 },
  { id: 9004, name: "Wellness Pharma", distance: 2300 },
  { id: 9005, name: "City Care Pharmacy", distance: 3100 },
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
