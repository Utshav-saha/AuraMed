# AuraMed API Reference

Base URL: `/` — all routers are mounted under `/api/v1/*`.
Interactive docs: `GET /docs` (Swagger UI), `GET /openapi.json`.

CORS is open (`allow_origins=["*"]`).

| Router | Prefix | Tag |
| --- | --- | --- |
| `auth` | `/api/v1/auth` | Authentication |
| `medicines` | `/api/v1/medicines` | Medicines Search Engine |
| `search_pharmacy` | `/api/v1/pharmacies` | Pharmacy Search Engine |
| `chatbot` | `/api/v1/chat` | Drug Safety Chatbot |
| `prescription_scan` | `/api/v1/prescriptions` | Prescription Functionalities |
| `patient_page` | `/api/v1/patient_page` | Patient Page |
| `cart` | `/api/v1/cart` | Cart Functionalities |

### `GET /`
Health check. → `{ "status": "healthy", "service": "AuraMed Backend Entry" }`

---

## Authentication — `/api/v1/auth`

Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib). Auth uses JWT bearer tokens
(`HS256`, 7-day expiry). `users.id` is a UUID; `patients.id` is a bigint.

### `POST /register`
Create a `Patient` user + linked `patients` row.

Request:
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "Secret#123" }
```
Validation: name ≥ 2 chars; valid email; password ≥ 8 chars with upper, lower, digit, special.

Response `AuthResponse`:
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": { "id": "<uuid>", "email": "jane@example.com", "role": "Patient" },
  "patient": { "id": 12, "name": "Jane Doe" }
}
```
Errors: `422` invalid input, `409` email already exists.

### `POST /login`
Request: `{ "email": "...", "password": "..." }` → `AuthResponse`. `401` on bad credentials.

### `GET /me`
Header: `Authorization: Bearer <token>`. → `AuthResponse` for the current user. `401` invalid/expired token.

---

## Medicines Search Engine — `/api/v1/medicines`

### `GET /search-medicines`
Smart search. Gemini classifies the query as a medicine NAME or a SYMPTOM, embeds it
(Nomic), and calls the matching RPC (`match_medicines_by_name` / `match_medicines_by_symptom`).

Query params: `q` (required), `limit` (1–50, default 10).

Response `list[SearchResponse]`:
```json
[{ "medicine_id": 1, "brand_name": "Napa", "strength": "500 mg",
   "manufacturer_name": "Beximco", "generic_name": "Paracetamol", "similarity": 0.82 }]
```

### `GET /fetch_medicine_details`
Full medicine record joined with dosage form, generic, and drug class.

Query params: `medicine_id` (required). → `MedicineDetails` (id, brand_name, drug_type,
slug, strength, packaging, manufacturer, dosage_form, generic_name, and the generic's
clinical description fields). `404` if not found.

---

## Pharmacy Search Engine — `/api/v1/pharmacies`

### `POST /search-pharmacies`
Given a cart + user location, returns pharmacies via the `find_nearby_pharmacy` RPC,
grouped into one-stop / multi-stop / partial-match options. Generic ids are resolved
server-side from `target_medicine_ids` (order-preserving), so the three input arrays
stay index-aligned.

Request `SearchRequest`:
```json
{
  "user_lat": 23.81, "user_lng": 90.41,
  "search_radius_meters": 5000.0,
  "target_medicine_ids": [1, 2],
  "target_dosage_forms": [3, 3],
  "target_quantities": [10, 5]
}
```

Response `CartResult`:
```json
{
  "one_stop_options": [ { "pharmacy_id": 4, "pharmacy_name": "X", "distance_meters": 320.0,
      "items": [ { "provided_medicine_id": 1, "is_exact": true, "stock_count": 40 } ] } ],
  "multi_stop_route": [ { "medicine_id": 1, "pharmacy_name": "X", "distance_meters": 320.0 } ],
  "partial_matches": [ { "pharmacy_id": 4, "pharmacy_name": "X", "distance_meters": 320.0,
      "available_medicines": [ { "medicine_id": 1, "stock_count": 40, "is_exact": true } ],
      "medicine_count": 1 } ]
}
```

### `GET /search-by-name`
Query params: `q`, `limit` (default 5). Case-insensitive store-name search.
→ `[{ "pharmacy_id": 4, "pharmacy_name": "X" }]`

---

## Drug Safety Chatbot — `/api/v1/chat`

### `POST /chatbot`
RAG over official drug leaflets. Embeds the question, fetches the best-matching leaflet
chunk via `match_leaflets` (optionally scoped to a `generic_id`), and streams Gemini's
answer as Server-Sent Events (`text/event-stream`, `data: <chunk>\n\n`). The model is
constrained to the leaflet context only.

Request `chatRequest`:
```json
{ "user_question": "Can I take this while pregnant?", "generic_id": 42 }
```
`generic_id` is optional (`0`/omitted → unscoped search).

---

## Prescription Functionalities — `/api/v1/prescriptions`

### `POST /scan`
Multipart upload of a prescription image. Runs Gemini Vision OCR and returns a **pre-filled
review form — nothing is persisted here**. For each medicine it returns the best name match,
the identified dosage form, and **all brand variants** (strength + dosage form) so the patient
can pick the right one. An auto-selected variant is chosen from the scanned strength + form.

Form field: `file` (image/*).

Response `ScanReviewResponse`:
```json
{
  "doctor_name": "Dr. A. Rahman", "doctor_specialization": "MBBS, FCPS",
  "disease_diagnosis": "Bacterial infection", "raw_ocr_text": "...",
  "medicines": [
    {
      "scanned_name": "A-Clox 500", "scanned_strength": "500 mg", "scanned_dosage_form": "vial",
      "medicine_id": 101, "brand_name": "A-Clox", "generic_name": "Cloxacillin",
      "strength": "500 mg/vial", "dosage_form_id": 3, "dosage_form_name": "Injection",
      "similarity": 0.79,
      "variants": [
        { "medicine_id": 101, "brand_name": "A-Clox", "strength": "500 mg/vial",
          "slug": "a-cloxinjection500-mgvial", "package_container": "...", "package_size": "...",
          "dosage_form_id": 3, "dosage_form_name": "Injection" }
      ],
      "dosage_instruction": "1+0+1", "duration_days": 7
    }
  ]
}
```

### `GET /dosage_forms`
All dosage forms, for the edit-time dropdown. → `[{ "id": 3, "name": "Injection" }]`

### `GET /medicine_variants`
Query param: `brand_name`. All variants of a brand, for the edit-time variant selector.
→ `list[MedicineVariant]` (same shape as `variants` above).

### `POST /save_prescription`
Persist the reviewed/edited prescription. Resolves (or creates) the doctor by name,
inserts the `prescriptions` row, then the `prescription_items`. `dosage_form_id` is
accepted per item for reference but **not stored** (it lives on the medicine record).

Request `SavePrescriptionRequest`:
```json
{
  "patient_id": 12, "doctor_name": "Dr. A. Rahman", "doctor_specialization": "MBBS",
  "disease_diagnosis": "Bacterial infection", "raw_ocr_text": "...",
  "medicines": [ { "medicine_id": 101, "dosage_form_id": 3,
                   "dosage_instruction": "1+0+1", "duration_days": 7 } ]
}
```
Response: `{ "prescription_id": 55, "doctor_id": 8, "item_count": 1 }`

### `POST /add_prescription_from_qr`
Query params: `patient_id`, `id`. Attaches an existing prescription to a patient
(`UPDATE prescriptions SET patient_id = ... WHERE id = ...`).

### `POST /remove_prescription`
Query params: `patient_id`, `id`. Deletes the patient's prescription.

### `POST /edit_prescription`
Query params: `patient_id`, `id`; body: `updated_data` (dict with `doctor_id`,
`disease_diagnosis`). Updates the prescription header.

---

## Patient Page — `/api/v1/patient_page`

### `GET /get_patient`
Query param: `user_id` (the user's UUID). Joins `users` for the email and returns the
patient profile with home coordinates decoded from the `geography` column. → `PatientResponse`.

### `GET /get_prescriptions`
Query param: `patient_id`. Returns the patient's prescriptions with items and doctor info
(`created_at`→`prescribed_at`, `duration_days`→`duration`). → `list[PrescriptionResponse]`. `404` if none.

### `POST /calculate_dosage`
Pure computation (no DB). Sums each item's `dosage_instruction` (e.g. `1+0+1`) × `duration`.

Request:
```json
{ "items": [ { "medicine_id": 1, "dosage_instruction": "1+0+1", "duration": 7 } ] }
```
Response: `{ "total_dosages": [ { "medicine_id": 1, "total_dosage": 14 } ] }`.
`400` if a dosage instruction is not `+`-separated integers.

### `POST /send_notification`
Schedules a medicine reminder.
Request `NotificationRequest`: `{ "patient_email", "medicine_name", "schedule_time", "status" }`.
Inserts into the `patient_reminders` table.

---

## Cart Functionalities — `/api/v1/cart`

### `POST /add_to_cart`
Adds a medicine to `patient_cart`, computing `price` from the medicine's `package_container`
(number after the first `৳`, else the first number).

Request `AddToCartRequest`:
```json
{ "medicine_id": 1, "count": 2, "order_status": "pending",
  "assigned_pharmacy": null, "patient_id": 12 }
```
Response: `{ "cart_id": 77 }`.

### `POST /remove_from_cart`
Query param: `cart_id`. → `{ "message": "Cart item removed successfully" }`. `404` if missing.

### `GET /get_cart_items`
Query param: `patient_id`. → `list[CartItemResponse]` (cart_id, medicine_id, count,
order_status, assigned_pharmacy_name, patient_id).

### `POST /checkout`
Assigns each cart item to the nearest pharmacy holding stock (via `find_nearby_pharmacy`)
and marks assigned rows `confirmed`.

Request `CheckoutRequest`:
```json
{ "patient_id": 12, "items": [ { "medicine_id": 1, "count": 2 } ],
  "user_lat": 23.81, "user_lng": 90.41, "search_radius_meters": 5000.0 }
```
Response `CheckoutResponse`: `{ "status", "assignments": [...], "unassigned_medicine_ids": [...] }`.

### `POST /calculate_total_cost`
Computes per-line and total cost from `package_container` unit prices.

Request: `{ "items": [ { "medicine_id": 1, "count": 3 } ] }`.
Response `CalculateCostResponse`:
```json
{
  "line_items": [ { "medicine_id": 1, "brand_name": "A-Clox",
    "package_container": "500 mg vial: ৳ 28.43,(5's pack: ৳ 142.15)",
    "count": 3, "unit_price": 28.43, "line_total": 85.29 } ],
  "total_cost": 85.29,
  "unpriced_medicine_ids": []
}
```
Medicines with no parseable price get `unit_price: null`, are excluded from the total, and
listed in `unpriced_medicine_ids`.

### `GET /past_orders`
Query param: `patient_id`. Cart rows whose `order_status != 'pending'`. → `list[CartItemResponse]`.

---

## Known schema mismatches

These queries do **not** match `schema.sql` and will fail at runtime (see the conversation
for the proposed fixes):

1. **`patient_page.get_prescriptions`** — selects `p.prescribed_at` (column is `created_at`)
   and `pi.duration` (column is `duration_days`).
2. **`patient_page.get_patient`** — selects `email` from `patients` (email lives on `users`);
   `user_id` is treated as an `int` but `patients.user_id`/`users.id` are `uuid`.
3. **`patient_page.send_notification`** — inserts into a `notifications` table (the schema has
   `patient_reminders`), and reads `.status_code` on the Supabase result, which does not exist.
4. **`prescription_scan.edit_prescription`** — updates a `doctor_name` column on `prescriptions`,
   which has no such column (only `doctor_id`).
5. **`cart.checkout`** — calls `find_nearby_pharmacy` without `target_quantities` and
   `target_dosage_form_ids`; the function defines all seven arguments.
6. **`medicines.fetch_medicine_details`** — selects `g.generic_name` (the `generics` column is
   `name`; use `g.name AS generic_name`).
7. **`dosage_forms` table** — referenced by a FK and by the prescription-scan code, but has no
   `CREATE TABLE` in `schema.sql` (present in the live DB, missing from the checked-in schema).
