// backend: app/api/*.py . shob endpoint ekhane, token auto attach hoy

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const V1 = `${API_BASE}/api/v1`;
const STORAGE_KEY = "auramed_auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw).token ?? null) : null;
  } catch {
    return null;
  }
}

function detail(text: string): string {
  try {
    const j = JSON.parse(text);
    if (typeof j?.detail === "string") return j.detail;
    if (Array.isArray(j?.detail)) return j.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ");
  } catch {
    /* plain text */
  }
  return text || "Request failed";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${V1}${path}`, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    if (!location.pathname.startsWith("/login")) location.href = "/login?expired=1";
  }
  if (!res.ok) throw new ApiError(res.status, detail(await res.text()));
  if (res.status === 204) return undefined as T;
  return res.json();
}

const qs = (o: Record<string, string | number | undefined | null>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

// ── types ──
export interface AuthUser { id: string; email: string; role: string }
export interface AuthPatient { id: number; name: string }
export interface AuthResponse { access_token: string; token_type: string; user: AuthUser; patient: AuthPatient | null }

export interface Suggestion { kind: "brand" | "generic"; label: string; medicine_id?: number | null; generic_id?: number | null; sub?: string | null }

export interface MedicineResult {
  medicine_id: number; brand_name: string; strength: string | null; manufacturer_name: string | null;
  generic_name: string | null; similarity: number; dosage_form?: string | null; unit_price?: number | null;
}

export interface MedicineDetails {
  id: number; brand_name: string; drug_type: string | null; slug: string | null; strength: string | null;
  package_container: string | null; package_size: string | null; unit_price: number | null; pack_price: number | null;
  manufacturer_name: string | null; dosage_form: string | null; dosage_form_id: number | null;
  generic_id: number | null; generic_name: string | null; drug_class_name: string | null; indication_name: string | null;
  indication_description: string | null; therapeutic_class_description: string | null; pharmacology_description: string | null;
  dosage_description: string | null; administration_description: string | null; interaction_description: string | null;
  contraindications_description: string | null; side_effects_description: string | null;
  pregnancy_and_lactation_description: string | null; precautions_description: string | null;
  pediatric_usage_description: string | null; overdose_effects_description: string | null;
  duration_of_treatment_description: string | null; reconstitution_description: string | null;
  storage_conditions_description: string | null;
}

export interface Alternative { medicine_id: number; brand_name: string; strength: string | null; manufacturer_name: string | null; dosage_form: string | null; unit_price: number | null }

export interface CartItem { provided_medicine_id: number; provided_medicine_name: string; target_medicine_id: number; is_exact: boolean; stock_count: number }
export interface PharmacyBase { pharmacy_id: number; pharmacy_name: string; distance_meters: number; lat: number | null; lng: number | null }
export interface OneStopShop extends PharmacyBase { items: CartItem[] }
export interface MultiStopItem {
  target_medicine_id: number; target_medicine_name: string; provided_medicine_id: number; provided_medicine_name: string;
  is_exact: boolean; pharmacy_id: number; pharmacy_name: string; distance_meters: number; lat: number | null; lng: number | null; stop_order: number;
}
export interface PartialMatch extends PharmacyBase { available_medicines: CartItem[]; medicine_count: number }
export interface CartResult {
  one_stop_options: OneStopShop[]; multi_stop_route: MultiStopItem[]; missing_medicine_ids: number[];
  partial_matches: PartialMatch[]; target_names: Record<string, string>;
}
export interface CheckPharmacyItem { medicine_id: number; brand_name: string; in_stock: boolean; stock_count: number; substitutes: CartItem[] }
export interface PharmacyHit { pharmacy_id: number; pharmacy_name: string; lat: number | null; lng: number | null }

export interface CartRow {
  cart_id: number; medicine_id: number; brand_name: string | null; strength: string | null; dosage_form: string | null;
  count: number; unit_price: number | null; order_status: string; assigned_pharmacy: number | null;
  assigned_pharmacy_name: string | null; ordered_at: string | null;
}
export interface Assignment { cart_id: number; medicine_id: number; brand_name: string | null; count: number; pharmacy_id: number; pharmacy_name: string; distance_meters: number; line_total: number | null }
export interface CheckoutResponse { status: "checkout_complete" | "partial" | "nothing_available"; assignments: Assignment[]; unassigned: CartRow[]; total_cost: number }
export interface OrderGroup { ordered_at: string | null; pharmacy_id: number | null; pharmacy_name: string | null; status: string; items: CartRow[]; total: number }

export interface Coordinate { latitude: number; longitude: number }
export interface PatientProfile { patient_id: number; name: string; email: string; user_id: string; home_location: Coordinate | null }

export interface RxItem {
  item_id: number; medicine_id: number | null; medicine_name: string | null; brand_name: string | null; generic_name: string | null;
  strength: string | null; dosage_form: string | null; dosage_instruction: string; duration: number; dose: [number, number, number];
}
export interface Prescription {
  prescription_id: number; doctor_id: number | null; doctorName: string | null; specialization: string | null;
  prescribed_at: string; disease_diagnosis: string | null; raw_ocr_text: string | null; location_issued: Coordinate | null;
  reminders_set: boolean; items: RxItem[];
}
export interface TotalDosage { medicine_id: number; total_dosage: number; per_day: number }

export interface Reminder { id: number; prescription_id: number | null; medicine_name: string; dose_label: string | null; schedule_time: string; status: string }
export interface ReminderTimes { morning: string; noon: string; night: string }

export interface Slot { id: number; date: string | null; time_slot: string; available_slots: number; hospital_id: number | null; hospital_name: string | null; hospital_contact: string | null }
export interface DoctorResult { id: number; name: string; specialization: string | null; slots: Slot[] }
export interface Appointment {
  id: number; date: string; time: string; time_slot: string | null; status: string; doctor_id: number;
  doctor_name: string | null; specialization: string | null; hospital_name: string | null; hospital_contact: string | null;
}

export interface MedicineVariant { medicine_id: number; brand_name: string; strength: string | null; dosage_form_id: number | null; dosage_form_name: string | null }
export interface ScannedMedicine {
  scanned_name: string; scanned_strength: string | null; scanned_dosage_form: string | null; medicine_id: number | null;
  brand_name: string | null; generic_name: string | null; strength: string | null; dosage_form_id: number | null;
  dosage_form_name: string | null; similarity: number | null; variants: MedicineVariant[]; dosage_instruction: string; duration_days: number;
}
export interface ScanReview { doctor_name: string | null; doctor_specialization: string | null; disease_diagnosis: string | null; raw_ocr_text: string; medicines: ScannedMedicine[] }
export interface SaveMedicineItem { medicine_id: number | null; medicine_name?: string | null; dosage_form_id?: number | null; dosage_instruction: string; duration_days: number }
export interface SavePrescriptionBody { doctor_name: string | null; doctor_specialization: string | null; disease_diagnosis: string | null; raw_ocr_text: string | null; medicines: SaveMedicineItem[] }
export interface DosageForm { id: number; name: string }

export interface ChatTurn { role: "user" | "assistant"; text: string }
export interface ChatEvent { t?: string; route?: string; sources?: string[]; done?: boolean }

// ── api ──
export const api = {
  // auth
  register: (b: { name: string; email: string; password: string }) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<AuthResponse>("/auth/me"),

  // medicines
  suggest: (q: string, limit = 8) => request<Suggestion[]>(`/medicines/suggest${qs({ q, limit })}`),
  searchMedicines: (q: string, limit = 12) => request<MedicineResult[]>(`/medicines/search-medicines${qs({ q, limit })}`),
  medicineDetails: (id: number) => request<MedicineDetails>(`/medicines/fetch_medicine_details${qs({ medicine_id: id })}`),
  alternatives: (id: number) => request<Alternative[]>(`/medicines/alternatives${qs({ medicine_id: id })}`),

  // pharmacies
  searchPharmacies: (b: { user_lat: number; user_lng: number; search_radius_meters?: number; target_medicine_ids: number[]; target_quantities?: number[] }) =>
    request<CartResult>("/pharmacies/search-pharmacies", { method: "POST", body: JSON.stringify(b) }),
  checkPharmacy: (b: { pharmacy_id: number; medicine_ids: number[]; quantities?: number[] }) =>
    request<CheckPharmacyItem[]>("/pharmacies/check-pharmacy", { method: "POST", body: JSON.stringify(b) }),
  pharmaciesByName: (q: string) => request<PharmacyHit[]>(`/pharmacies/search-by-name${qs({ q })}`),

  // cart
  cart: () => request<CartRow[]>("/cart/get_cart_items"),
  addToCart: (b: { medicine_id: number; count?: number; assigned_pharmacy?: number | null }) =>
    request<{ cart_id: number; merged: boolean }>("/cart/add_to_cart", { method: "POST", body: JSON.stringify(b) }),
  updateCount: (cart_id: number, count: number) => request<{ ok: true }>("/cart/update_count", { method: "POST", body: JSON.stringify({ cart_id, count }) }),
  removeFromCart: (cart_id: number) => request<{ message: string }>(`/cart/remove_from_cart${qs({ cart_id })}`, { method: "POST" }),
  clearCart: () => request<{ ok: true }>("/cart/clear", { method: "POST" }),
  checkout: (b: { user_lat?: number; user_lng?: number; search_radius_meters?: number }) =>
    request<CheckoutResponse>("/cart/checkout", { method: "POST", body: JSON.stringify(b) }),
  pastOrders: () => request<OrderGroup[]>("/cart/past_orders"),

  // patient
  patient: () => request<PatientProfile>("/patient_page/get_patient"),
  setHomeLocation: (c: Coordinate) => request<{ ok: true }>("/patient_page/home_location", { method: "PUT", body: JSON.stringify(c) }),
  prescriptions: () => request<Prescription[]>("/patient_page/get_prescriptions"),
  calculateDosage: (items: { medicine_id: number; dosage_instruction: string; duration: number }[]) =>
    request<{ total_dosages: TotalDosage[] }>("/patient_page/calculate_dosage", { method: "POST", body: JSON.stringify({ items }) }),
  reminders: () => request<Reminder[]>("/patient_page/reminders"),
  createReminders: (b: { prescription_id: number; times?: ReminderTimes; start_date?: string }) =>
    request<{ created: number }>("/patient_page/reminders", { method: "POST", body: JSON.stringify(b) }),
  deleteReminders: (prescription_id: number) => request<{ deleted: number }>(`/patient_page/reminders/${prescription_id}`, { method: "DELETE" }),

  // prescriptions
  scanPrescription: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ScanReview>("/prescriptions/scan", { method: "POST", body: fd });
  },
  savePrescription: (b: SavePrescriptionBody) => request<{ prescription_id: number }>("/prescriptions/save_prescription", { method: "POST", body: JSON.stringify(b) }),
  editPrescription: (id: number, b: SavePrescriptionBody) => request<{ ok: true }>(`/prescriptions/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  removePrescription: (id: number) => request<{ ok: true }>(`/prescriptions/remove_prescription${qs({ id })}`, { method: "POST" }),
  linkPrescription: (id: number) => request<{ ok: true }>(`/prescriptions/add_prescription_from_qr${qs({ id })}`, { method: "POST" }),
  dosageForms: () => request<DosageForm[]>("/prescriptions/dosage_forms"),
  medicineVariants: (brand_name: string) => request<MedicineVariant[]>(`/prescriptions/medicine_variants${qs({ brand_name })}`),

  // appointments
  searchDoctors: (q?: string) => request<DoctorResult[]>(`/appointments/search${qs({ q })}`),
  book: (availability_id: number) => request<{ message: string }>("/appointments/book", { method: "POST", body: JSON.stringify({ availability_id }) }),
  cancelAppointment: (id: number) => request<{ ok: true }>(`/appointments/${id}/cancel`, { method: "POST" }),
  myAppointments: (status: "upcoming" | "past") => request<Appointment[]>(`/appointments/my-appointments${qs({ status })}`),

  // chat: SSE stream, protita event JSON
  async *chat(body: { user_question: string; generic_id?: number | null; history?: ChatTurn[] }, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${V1}/chat/chatbot`, { method: "POST", headers, body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) throw new ApiError(res.status, detail(await res.text()));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (line) yield JSON.parse(line.slice(6)) as ChatEvent;
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

export const taka = (n: number | null | undefined) => (n == null ? "—" : `৳${n.toFixed(2)}`);
export const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function geolocate(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!("geolocation" in navigator)) return rej(new Error("Location not supported"));
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
