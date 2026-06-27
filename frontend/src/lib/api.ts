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

  googleLogin(credential: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
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
        function pump() {
          reader.read().then(({ done, value }) => {
            if (done) { onDone(); return; }
            const chunk = decoder.decode(value, { stream: true });
            chunk.split("\n").forEach((line) => {
              if (line.startsWith("data: ")) onChunk(line.slice(6));
            });
            pump();
          });
        }
        pump();
      })
      .catch(onError);
  },
};
