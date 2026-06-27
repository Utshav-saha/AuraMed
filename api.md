# AuraMed API Reference

Base URL: `http://localhost:8000`

All endpoints are prefixed with `/api/v1`.

---

## Authentication — `/api/v1/auth`

### POST `/register`
Register a new patient account.

**Request body**
```json
{
  "name": "string (min 2 chars)",
  "email": "string",
  "password": "string (min 8 chars, upper, lower, digit, special)"
}
```

**Response `200`**
```json
{
  "access_token": "string",
  "token_type": "bearer",
  "user": { "id": "string", "email": "string", "role": "string" },
  "patient": { "id": 1, "name": "string" }
}
```

**Errors** `409` email already exists · `422` validation failure

---

### POST `/login`
Login with email and password.

**Request body**
```json
{ "email": "string", "password": "string" }
```

**Response `200`** — same shape as `/register`

**Errors** `401` invalid credentials

---

### GET `/me`
Return the currently authenticated user. Requires `Authorization: Bearer <token>`.

**Response `200`** — same shape as `/register`

**Errors** `401` missing/expired token

---

## Medicines — `/api/v1/medicines`

### GET `/search-medicines`
AI-powered medicine search by name or symptom. Gemini classifies the query then routes to the appropriate vector-search function.

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Medicine name or symptom description |
| `limit` | int | 10 | Max results (1–50) |

**Response `200`**
```json
[
  {
    "medicine_id": 1,
    "brand_name": "Napa",
    "strength": "500mg",
    "manufacturer_name": "Beximco",
    "generic_name": "Paracetamol",
    "similarity": 0.87
  }
]
```

---

### GET `/fetch_medicine_details`
Full details for a single medicine, including leaflet information.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `medicine_id` | int | Medicine ID |

**Response `200`**
```json
{
  "id": 1,
  "brand_name": "string",
  "drug_type": "string",
  "slug": "string",
  "strength": "string",
  "package_container": "string",
  "package_size": "string",
  "manufacturer_name": "string",
  "dosage_form": "string",
  "generic_name": "string",
  "indication_name": "string",
  "indication_description": "string",
  "therapeutic_class_description": "string",
  "pharmacology_description": "string",
  "dosage_description": "string",
  "administration_description": "string",
  "interaction_description": "string",
  "contraindications_description": "string",
  "side_effects_description": "string",
  "pregnancy_and_lactation_description": "string",
  "precautions_description": "string",
  "pediatric_usage_description": "string",
  "overdose_effects_description": "string",
  "duration_of_treatment_description": "string",
  "reconstitution_description": "string",
  "storage_conditions_description": "string"
}
```

**Errors** `404` medicine not found

---

## Pharmacy Search — `/api/v1/pharmacies`

### POST `/search-pharmacies`
Find pharmacies near the user that stock the requested medicines. Generic substitutes are allowed only when the dosage form matches (e.g. a tablet prescription will not be fulfilled by a suppository).

Returns three result sets: one-stop options, a multi-stop route, and partial matches.

**Request body**
```json
{
  "user_lat": 23.8103,
  "user_lng": 90.4125,
  "search_radius_meters": 5000.0,
  "target_medicine_ids": [101, 202],
  "target_dosage_forms": [1, 1],
  "target_quantities": [10, 20]
}
```

> `target_medicine_ids`, `target_dosage_forms`, and `target_quantities` are parallel arrays — index `i` in each array describes the same cart item.

**Response `200`**
```json
{
  "one_stop_options": [
    {
      "pharmacy_id": 5,
      "pharmacy_name": "ABC Pharmacy",
      "distance_meters": 320.5,
      "items": [
        { "provided_medicine_id": 101, "is_exact": true, "stock_count": 50 }
      ]
    }
  ],
  "multi_stop_route": [
    { "medicine_id": 202, "pharmacy_name": "XYZ Pharmacy", "distance_meters": 800.0 }
  ],
  "partial_matches": [
    {
      "pharmacy_id": 9,
      "pharmacy_name": "DEF Pharmacy",
      "distance_meters": 450.0,
      "available_medicines": [
        { "medicine_id": 101, "stock_count": 20, "is_exact": true }
      ],
      "medicine_count": 1
    }
  ]
}
```

---

### GET `/search-by-name`
Autocomplete pharmacy names.

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Partial pharmacy name |
| `limit` | int | 5 | Max results |

**Response `200`**
```json
[{ "pharmacy_id": 1, "pharmacy_name": "ABC Pharmacy" }]
```

---

## Drug Safety Chatbot — `/api/v1/chat`

### POST `/chatbot`
Ask a clinical question about a drug. Answers are grounded strictly in the official drug leaflet (retrieved via vector search). Returns a streaming Server-Sent Events (SSE) response.

**Request body**
```json
{
  "user_question": "Can I take this with alcohol?",
  "generic_id": 42
}
```

> Set `generic_id` to `0` or omit it to search across all leaflets.

**Response** `text/event-stream` — SSE chunks, each line in the form:
```
data: <text fragment>
```

---

## Prescriptions — `/api/v1/prescriptions`

### POST `/scan`
Upload a prescription image. Gemini Vision extracts medicines, doctor info, and diagnosis; each medicine is matched to the database by name embedding. Saves a `prescriptions` record and `prescription_items`.

**Request** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | image (JPEG/PNG/WEBP) | Prescription photo |
| `patient_id` | int (query param, optional) | Patient to associate the prescription with |

**Response `200`**
```json
{
  "prescription_id": 1,
  "doctor_id": 3,
  "doctor_name": "Dr. Rahman",
  "disease_diagnosis": "Hypertension",
  "raw_ocr_text": "...",
  "items": [
    {
      "medicine_id": 101,
      "brand_name": "Napa",
      "generic_name": "Paracetamol",
      "dosage_instruction": "1+0+1",
      "duration_days": 7,
      "similarity": 0.91
    }
  ]
}
```

**Errors** `400` not an image · `422` image preprocessing failed · `502` Gemini/DB error

---

### POST `/add_prescription_from_qr`
Link an existing prescription (scanned by a doctor) to a patient via QR code.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | int | Patient to assign |
| `id` | int | Prescription ID from QR |

**Response `200`** `{}`

---

### POST `/remove_prescription`
Unlink a prescription from a patient.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | int | Patient ID |
| `id` | int | Prescription ID |

**Response `200`** `{}`

---

### POST `/edit_prescription`
Update doctor and diagnosis on a prescription.

**Query params** `patient_id`, `id`

**Request body**
```json
{
  "doctor_id": 3,
  "doctor_name": "Dr. Rahman",
  "disease_diagnosis": "Updated diagnosis"
}
```

**Response `200`** `{}`

---

## Patient Page — `/api/v1/patient_page`

### GET `/get_patient`
Fetch patient profile including home location.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `user_id` | int | User ID (from auth token payload) |

**Response `200`**
```json
{
  "patient_id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "user_id": 10,
  "home_location": { "latitude": 23.81, "longitude": 90.41 }
}
```

**Errors** `404` patient not found

---

### GET `/get_prescriptions`
All prescriptions for a patient, with their items.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | int | Patient ID |

**Response `200`**
```json
[
  {
    "prescription_id": 1,
    "patient_id": 1,
    "doctor_id": 3,
    "prescribed_at": "2024-01-01T10:00:00Z",
    "disease_diagnosis": "Fever",
    "location_issued": { "latitude": 23.81, "longitude": 90.41 },
    "items": [
      { "medicine_id": 101, "dosage_instruction": "1+1+1", "duration": 5 }
    ]
  }
]
```

**Errors** `404` no prescriptions found

---

### POST `/calculate_dosage`
Compute total pills/doses needed for each medicine from a list of prescription items.

**Request body**
```json
{
  "items": [
    { "medicine_id": 101, "dosage_instruction": "1+0+1", "duration": 7 }
  ]
}
```

> `dosage_instruction` format: `morning+noon+night` (e.g. `"1+0+1"` = 2 doses/day).

**Response `200`**
```json
{
  "total_dosages": [
    { "medicine_id": 101, "total_dosage": 14 }
  ]
}
```

**Errors** `400` invalid dosage instruction format

---

### POST `/send_notification`
Schedule a medicine reminder email for a patient.

**Request body**
```json
{
  "patient_email": "patient@example.com",
  "medicine_name": "Napa 500mg",
  "schedule_time": "2024-01-01T08:00:00Z",
  "status": "pending"
}
```

**Response `200`** `{ "message": "Notification scheduled successfully" }`

---

## Cart — `/api/v1/cart`

### POST `/add_to_cart`
Add a medicine to the patient's cart.

**Request body**
```json
{
  "medicine_id": 101,
  "count": 10,
  "order_status": "pending",
  "assigned_pharmacy": null,
  "patient_id": 1
}
```

**Response `200`** `{ "cart_id": 42 }`

---

### POST `/remove_from_cart`
Remove an item from the cart.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `cart_id` | int | Cart item ID |

**Response `200`** `{ "message": "Cart item removed successfully" }`

**Errors** `404` cart item not found

---

### GET `/get_cart_items`
All current (pending) cart items for a patient.

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | int | Patient ID |

**Response `200`**
```json
[
  {
    "cart_id": 42,
    "medicine_id": 101,
    "count": 10,
    "order_status": "pending",
    "assigned_pharmacy_name": null,
    "patient_id": 1
  }
]
```

---

### POST `/checkout`
Find the nearest pharmacy for each cart item (exact matches only) and confirm the order. Items that cannot be sourced are returned as `unassigned_medicine_ids`.

**Request body**
```json
{
  "patient_id": 1,
  "items": [
    { "medicine_id": 101, "count": 10 }
  ],
  "user_lat": 23.8103,
  "user_lng": 90.4125,
  "search_radius_meters": 5000.0
}
```

**Response `200`**
```json
{
  "status": "checkout_complete",
  "assignments": [
    {
      "medicine_id": 101,
      "pharmacy_id": 5,
      "pharmacy_name": "ABC Pharmacy",
      "distance_meters": 320.5
    }
  ],
  "unassigned_medicine_ids": []
}
```

---

### GET `/past_orders`
All confirmed/completed orders for a patient (status ≠ `pending`).

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | int | Patient ID |

**Response `200`** — same shape as `/get_cart_items`

---

## Common Error Format

```json
{ "detail": "Human-readable error message" }
```

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthenticated |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 422 | Unprocessable entity |
| 500 | Internal server error |
| 502 | Upstream service error (Gemini / Supabase) |
