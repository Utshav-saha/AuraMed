import {
  placeholderMedicineSearch,
  placeholderPharmacyNameSearch,
  placeholderPharmacySearch,
} from "./placeholder"; // placeholder

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type MedicineResult = {
  medicine_id: number;
  brand_name: string;
  strength: string | null;
  manufacturer_name: string | null;
  generic_name: string;
  similarity: number;
};

export type PharmacyCartItem = {
  provided_medicine_id: number;
  is_exact: boolean;
  stock_count: number;
};

export type OneStopShop = {
  pharmacy_id: number;
  pharmacy_name: string;
  distance_meters: number;
  items: PharmacyCartItem[];
};

export type MultiStopItem = {
  medicine_id: number;
  pharmacy_name: string;
  distance_meters: number;
};

export type AvailableMed = {
  medicine_id: number;
  stock_count: number;
  is_exact: boolean;
};

export type PartialMatch = {
  pharmacy_id: number;
  pharmacy_name: string;
  distance_meters: number;
  available_medicines: AvailableMed[];
  medicine_count: number;
};

export type CartResult = {
  one_stop_options: OneStopShop[];
  multi_stop_route: MultiStopItem[];
  partial_matches: PartialMatch[];
};

export type PrescriptionItem = {
  medicine_id: number | null;
  brand_name: string | null;
  generic_name: string | null;
  dosage_instruction: string;
  duration_days: number;
  similarity: number | null;
};

export type PrescriptionScanResponse = {
  prescription_id: number;
  doctor_id: number | null;
  doctor_name: string | null;
  disease_diagnosis: string | null;
  raw_ocr_text: string;
  items: PrescriptionItem[];
};

export type PharmacyNameResult = {
  pharmacy_id: number;
  pharmacy_name: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

export type AuthPatient = {
  id: number;
  name: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
  patient: AuthPatient | null;
};

// Full clinical leaflet for a single medicine (GET /medicines/fetch_medicine_details)
export type MedicineDetails = {
  id: number;
  brand_name: string;
  drug_type: string | null;
  slug: string | null;
  strength: string | null;
  package_container: string | null;
  package_size: string | null;
  manufacturer_name: string | null;
  dosage_form: string | null;
  generic_name: string | null;
  indication_name: string | null;
  indication_description: string | null;
  therapeutic_class_description: string | null;
  pharmacology_description: string | null;
  dosage_description: string | null;
  administration_description: string | null;
  interaction_description: string | null;
  contraindications_description: string | null;
  side_effects_description: string | null;
  pregnancy_and_lactation_description: string | null;
  precautions_description: string | null;
  pediatric_usage_description: string | null;
  overdose_effects_description: string | null;
  duration_of_treatment_description: string | null;
  reconstitution_description: string | null;
  storage_conditions_description: string | null;
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type PatientProfile = {
  patient_id: number;
  name: string;
  email: string;
  user_id: number;
  home_location: Coordinate;
};

// A single line item on a stored prescription (GET /patient_page/get_prescriptions)
export type PrescriptionLineItem = {
  medicine_id: number;
  dosage_instruction: string;
  duration: number;
};

export type Prescription = {
  prescription_id: number;
  patient_id: number;
  doctor_id: number;
  prescribed_at: string;
  disease_diagnosis: string;
  location_issued: Coordinate;
  items: PrescriptionLineItem[];
};

export type TotalDosage = {
  medicine_id: number;
  total_dosage: number;
};

// A row from the patient's cart (GET /cart/get_cart_items and /cart/past_orders)
export type CartItemRow = {
  cart_id: number;
  medicine_id: number;
  count: number;
  order_status: string;
  assigned_pharmacy_name: string | null;
  patient_id: number;
};

export type CheckoutAssignment = {
  medicine_id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  distance_meters: number;
};

export type CheckoutResult = {
  status: string;
  assignments: CheckoutAssignment[];
  unassigned_medicine_ids: number[];
};

export const api = {
  async searchMedicines(query: string, limit = 10): Promise<MedicineResult[]> {
    try {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      const res = await request<MedicineResult[]>(`/api/v1/medicines/search-medicines?${params}`);
      return res.length > 0 ? res : placeholderMedicineSearch(query); // placeholder
    } catch {
      return placeholderMedicineSearch(query); // placeholder
    }
  },

  async searchPharmacies(payload: {
    user_lat: number;
    user_lng: number;
    search_radius_meters?: number;
    target_medicine_ids: number[];
    target_quantities: number[];
  }): Promise<CartResult> {
    try {
      const res = await request<CartResult>("/api/v1/pharmacies/search-pharmacies", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const hasResults =
        res.one_stop_options.length > 0 || res.partial_matches.length > 0;
      // placeholder
      return hasResults
        ? res
        : placeholderPharmacySearch(payload.target_medicine_ids);
    } catch {
      // placeholder
      return placeholderPharmacySearch(payload.target_medicine_ids);
    }
  },

  async searchPharmaciesByName(q: string): Promise<PharmacyNameResult[]> {
    try {
      const res = await request<PharmacyNameResult[]>(
        `/api/v1/pharmacies/search-by-name?q=${encodeURIComponent(q)}`
      );
      return res.length > 0 ? res : placeholderPharmacyNameSearch(q); // placeholder
    } catch {
      return placeholderPharmacyNameSearch(q); // placeholder
    }
  },

  fetchMedicineDetails(medicineId: number): Promise<MedicineDetails> {
    return request<MedicineDetails>(
      `/api/v1/medicines/fetch_medicine_details?medicine_id=${medicineId}`
    );
  },

  // ── Cart ──────────────────────────────────────────────────────
  addToCart(payload: {
    medicine_id: number;
    count: number;
    order_status?: string;
    assigned_pharmacy?: number;
    patient_id: number;
  }): Promise<{ cart_id: number }> {
    return request<{ cart_id: number }>("/api/v1/cart/add_to_cart", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  removeFromCart(cartId: number): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/api/v1/cart/remove_from_cart?cart_id=${cartId}`,
      { method: "POST" }
    );
  },

  getCartItems(patientId: number): Promise<CartItemRow[]> {
    return request<CartItemRow[]>(
      `/api/v1/cart/get_cart_items?patient_id=${patientId}`
    );
  },

  pastOrders(patientId: number): Promise<CartItemRow[]> {
    return request<CartItemRow[]>(
      `/api/v1/cart/past_orders?patient_id=${patientId}`
    );
  },

  checkout(payload: {
    patient_id: number;
    items: { medicine_id: number; count: number }[];
    user_lat: number;
    user_lng: number;
    search_radius_meters?: number;
  }): Promise<CheckoutResult> {
    return request<CheckoutResult>("/api/v1/cart/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Patient page ──────────────────────────────────────────────
  getPatient(userId: number): Promise<PatientProfile> {
    return request<PatientProfile>(
      `/api/v1/patient_page/get_patient?user_id=${userId}`
    );
  },

  getPrescriptions(patientId: number): Promise<Prescription[]> {
    return request<Prescription[]>(
      `/api/v1/patient_page/get_prescriptions?patient_id=${patientId}`
    );
  },

  calculateDosage(
    items: { medicine_id: number; dosage_instruction: string; duration: number }[]
  ): Promise<{ total_dosages: TotalDosage[] }> {
    return request<{ total_dosages: TotalDosage[] }>(
      "/api/v1/patient_page/calculate_dosage",
      { method: "POST", body: JSON.stringify({ items }) }
    );
  },

  // ── Reminders ─────────────────────────────────────────────────
  sendNotification(payload: {
    patient_email: string;
    medicine_name: string;
    schedule_time: string;
    status: string;
  }): Promise<void> {
    return request<void>("/api/v1/patient_page/send_notification", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Prescriptions (QR linking) ────────────────────────────────
  addPrescriptionFromQr(patientId: number, prescriptionId: number): Promise<void> {
    return request<void>(
      `/api/v1/prescriptions/add_prescription_from_qr?patient_id=${patientId}&id=${prescriptionId}`,
      { method: "POST" }
    );
  },

  removePrescription(patientId: number, prescriptionId: number): Promise<void> {
    return request<void>(
      `/api/v1/prescriptions/remove_prescription?patient_id=${patientId}&id=${prescriptionId}`,
      { method: "POST" }
    );
  },

  register(payload: { name: string; email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  login(payload: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  me(token: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async scanPrescription(imageFile: File, patientId?: number): Promise<PrescriptionScanResponse> {
    const form = new FormData();
    form.append("file", imageFile);
    const url = patientId
      ? `/api/v1/prescriptions/scan?patient_id=${patientId}`
      : "/api/v1/prescriptions/scan";
    const res = await fetch(`${BASE_URL}${url}`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  streamChatbot(
    userQuestion: string,
    genericId: number | null,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): void {
    fetch(`${BASE_URL}/api/v1/chat/chatbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_question: userQuestion, generic_id: genericId }),
    })
      .then((res) => {
        if (!res.ok || !res.body) throw new Error(`Chatbot error: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ""; // holds an incomplete trailing SSE line between reads
        function pump() {
          reader.read().then(({ done, value }) => {
            if (done) {
              // flush any remaining buffered line
              if (buffer.startsWith("data: ")) onChunk(buffer.slice(6));
              onDone();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // last item may be a partial line
            for (const line of lines) {
              if (line.startsWith("data: ")) onChunk(line.slice(6));
            }
            pump();
          });
        }
        pump();
      })
      .catch(onError);
  },
};
