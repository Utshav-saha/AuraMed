# AuraMed API Reference

Base URL: `http://<host>/api/v1`

All endpoints return JSON unless noted. Errors follow `{ "detail": "<message>" }`.

---

## Medicines Search Engine `/api/v1/medicines`

### `GET /search-medicines`

Semantic search for medicines. Accepts a medicine name **or** a symptom description. Gemini classifies the query, then a vector similarity search runs against the medicine database.

**Query parameters**

| Param   | Type | Required | Default | Description                        |
|---------|------|----------|---------|------------------------------------|
| `q`     | str  | yes      | —       | Medicine name or symptom/condition |
| `limit` | int  | no       | `10`    | Max results (1–50)                 |

**Response** `200 application/json` — array of:

```json
[
  {
    "medicine_id": 42,
    "brand_name": "Napa",
    "strength": "500mg",
    "manufacturer_name": "Beximco",
    "generic_name": "Paracetamol",
    "similarity": 0.91
  }
]
```

**Logic**
- Query type `NAME` → `match_medicines_by_name` RPC, threshold 0.60
- Query type `SYMPTOM` → `match_medicines_by_symptom` RPC, threshold 0.45

---

### `GET /fetch_medicine_details`

Full clinical leaflet data for a single medicine.

**Query parameters**

| Param         | Type | Required | Description    |
|---------------|------|----------|----------------|
| `medicine_id` | int  | yes      | Medicine row ID |

**Response** `200 application/json`

```json
{
  "id": 42,
  "brand_name": "Napa",
  "drug_type": "Tablet",
  "slug": "napa-500mg",
  "strength": "500mg",
  "package_container": "Box",
  "package_size": "10x10",
  "manufacturer_name": "Beximco",
  "dosage_form": "Tablet",
  "generic_name": "Paracetamol",
  "indication_name": "Pain & Fever",
  "indication_description": "...",
  "therapeutic_class_description": "...",
  "pharmacology_description": "...",
  "dosage_description": "...",
  "administration_description": "...",
  "interaction_description": "...",
  "contraindications_description": "...",
  "side_effects_description": "...",
  "pregnancy_and_lactation_description": "...",
  "precautions_description": "...",
  "pediatric_usage_description": "...",
  "overdose_effects_description": "...",
  "duration_of_treatment_description": "...",
  "reconstitution_description": "...",
  "storage_conditions_description": "..."
}
```

**Errors** `404` medicine not found.

---

## Pharmacy Search Engine `/api/v1/pharmacies`

### `POST /search-pharmacies`

Finds nearby pharmacies that stock the requested medicines. Returns two routing strategies: one-stop shops and an optimal multi-stop route.

**Request body**

```json
{
  "user_lat": 23.8103,
  "user_lng": 90.4125,
  "search_radius_meters": 5000.0,
  "target_medicine_ids": [42, 87],
  "target_quantities": [2, 1]
}
```

| Field                   | Type        | Required | Default  | Description                           |
|-------------------------|-------------|----------|----------|---------------------------------------|
| `user_lat`              | float       | yes      | —        | User latitude                         |
| `user_lng`              | float       | yes      | —        | User longitude                        |
| `search_radius_meters`  | float       | no       | `5000.0` | Search radius                         |
| `target_medicine_ids`   | int[]       | yes      | —        | Medicine IDs to look for              |
| `target_quantities`     | int[]       | yes      | —        | Corresponding quantities needed       |

**Response** `200 application/json`

```json
{
  "one_stop_options": [
    {
      "pharmacy_id": 12,
      "pharmacy_name": "HealthPlus",
      "distance_meters": 320.5,
      "items": [
        { "provided_medicine_id": 42, "is_exact": true, "stock_count": 25 },
        { "provided_medicine_id": 87, "is_exact": false, "stock_count": 8 }
      ]
    }
  ],
  "multi_stop_route": [
    {
      "medicine_id": 42,
      "pharmacy_name": "HealthPlus",
      "distance_meters": 320.5
    },
    {
      "medicine_id": 87,
      "pharmacy_name": "MediCare",
      "distance_meters": 870.0
    }
  ],
  "partial_matches": [
    {
      "pharmacy_id": 12,
      "pharmacy_name": "HealthPlus",
      "distance_meters": 320.5,
      "available_medicines": [
        { "medicine_id": 42, "stock_count": 25, "is_exact": true }
      ],
      "medicine_count": 1
    }
  ]
}
```

**Logic**
- Resolves generic IDs for all medicine IDs to allow generic substitutions.
- Calls `find_nearby_pharmacy` Supabase RPC once, then partitions the rows three ways.
- `one_stop_options`: pharmacies covering **all** requested generics, sorted by distance (top 5).
- `multi_stop_route`: for each medicine, the closest pharmacy with an **exact** match.
- `partial_matches`: every pharmacy stocking **≥1** requested medicine, sorted by coverage then distance (top 5). Drives the "find the most" pharmacy view.
- `is_exact: false` means the pharmacy stocks a generic equivalent instead of the exact brand.

---

### `GET /search-by-name`

Typeahead lookup of pharmacies by store name (case-insensitive `ILIKE` match).

**Query parameters**

| Param   | Type | Required | Default | Description              |
|---------|------|----------|---------|--------------------------|
| `q`     | str  | yes      | —       | Partial pharmacy name    |
| `limit` | int  | no       | `5`     | Max results              |

**Response** `200 application/json` — array of:

```json
[
  { "pharmacy_id": 12, "pharmacy_name": "HealthPlus" }
]
```

---

## Drug Safety Chatbot `/api/v1/chat`

### `POST /chatbot`

Answers drug safety questions grounded strictly in the official drug leaflet. Returns a **Server-Sent Events (SSE)** stream.

**Request body**

```json
{
  "user_question": "Can I take this with alcohol?",
  "generic_id": 5
}
```

| Field           | Type | Required | Description                                           |
|-----------------|------|----------|-------------------------------------------------------|
| `user_question` | str  | yes      | The question to ask                                   |
| `generic_id`    | int  | no       | Narrows context to a specific generic drug's leaflet  |

**Response** `200 text/event-stream`

Each chunk is an SSE line, streamed token-by-token as Gemini produces them:

```
data: Based on the official leaflet, alcohol is contraindicated...

data:  Consult your physician before combining.

```

The stream simply ends when generation completes — there is **no** `[DONE]` sentinel; clients should treat the closed connection as completion. On a server-side failure the final chunk is `data: [ERROR: <message>]`.

If no relevant context is found, the stream returns:
```
data: I am sorry, but I cannot find that information in the official drug specifications.
```

**Logic**
- Embeds the question and runs `match_leaflets` RPC (threshold 0.4, top-1 chunk).
- Passes the retrieved leaflet chunk as context to Gemini (`gemini-2.5-flash`) with strict grounding instructions.
- Streams the response token-by-token.

---

## Prescription Functionalities `/api/v1/prescriptions`

### `POST /scan`

Uploads a prescription image, runs Gemini Vision OCR, resolves the doctor, matches medicines, and persists the full prescription.

**Request** `multipart/form-data`

| Field        | Type   | Required | Description                             |
|--------------|--------|----------|-----------------------------------------|
| `file`       | image  | yes      | JPEG / PNG / WEBP prescription image    |
| `patient_id` | int    | no       | Query param — patient to link to        |

**Response** `200 application/json`

```json
{
  "prescription_id": 101,
  "doctor_id": 7,
  "doctor_name": "Dr. Rahim",
  "disease_diagnosis": "Upper Respiratory Tract Infection",
  "raw_ocr_text": "Dr. Rahim MBBS...",
  "items": [
    {
      "medicine_id": 42,
      "brand_name": "Napa",
      "generic_name": "Paracetamol",
      "dosage_instruction": "1+0+1",
      "duration_days": 5,
      "similarity": 0.88
    }
  ]
}
```

**Pipeline**
1. Preprocess image → RGB JPEG, max 2048px via Pillow.
2. Gemini Vision extracts: `doctor_name`, `doctor_specialization`, `disease_diagnosis`, `raw_ocr_text`, medicine list with dosage (`morning+noon+night` format) and duration in days.
3. Doctor lookup by case-insensitive name → insert new row if not found.
4. Insert `prescriptions` row.
5. For each medicine: embed name → `match_medicines_by_name` RPC (threshold 0.60). Unmatched medicines are inserted with `medicine_id = null`.
6. Bulk insert `prescription_items`.

**Errors** `400` non-image file · `422` corrupt image · `502` Gemini or DB failure.

---

### `POST /add_prescription_from_qr`

Links an existing prescription to a patient (e.g. after scanning a QR code).

**Query parameters**

| Param        | Type | Required | Description          |
|--------------|------|----------|----------------------|
| `patient_id` | int  | yes      | Patient to assign to |
| `id`         | int  | yes      | Prescription row ID  |

**Response** `200 application/json` — empty on success.

---

### `POST /remove_prescription`

Removes a prescription record for a patient.

**Query parameters**

| Param        | Type | Required | Description         |
|--------------|------|----------|---------------------|
| `patient_id` | int  | yes      | Owning patient ID   |
| `id`         | int  | yes      | Prescription row ID |

**Response** `200 application/json` — empty on success.

---

## Patient Page `/api/v1/patient_page`

### `GET /get_patient`

Fetches a patient's profile including their home location.

**Query parameters**

| Param     | Type | Required | Description       |
|-----------|------|----------|-------------------|
| `user_id` | int  | yes      | Auth user ID      |

**Response** `200 application/json`

```json
{
  "patient_id": 3,
  "name": "Utshav Saha",
  "email": "utshav@example.com",
  "user_id": 9,
  "home_location": {
    "latitude": 23.8103,
    "longitude": 90.4125
  }
}
```

**Errors** `404` patient not found.

---

### `GET /get_prescriptions`

Returns all prescriptions for a patient with their line items.

**Query parameters**

| Param        | Type | Required | Description   |
|--------------|------|----------|---------------|
| `patient_id` | int  | yes      | Patient row ID |

**Response** `200 application/json` — array of:

```json
[
  {
    "prescription_id": 101,
    "patient_id": 3,
    "doctor_id": 7,
    "prescribed_at": "2026-06-20T10:30:00Z",
    "disease_diagnosis": "URTI",
    "location_issued": { "latitude": 23.81, "longitude": 90.41 },
    "items": [
      {
        "medicine_id": 42,
        "dosage_instruction": "1+0+1",
        "duration": 5
      }
    ]
  }
]
```

**Errors** `404` no prescriptions found.

---

### `POST /calculate_dosage`

Calculates the total number of units needed for each medicine across all prescription items.

**Request body**

```json
{
  "items": [
    { "medicine_id": 42, "dosage_instruction": "1+0+1", "duration": 5 },
    { "medicine_id": 42, "dosage_instruction": "0+1+0", "duration": 3 }
  ]
}
```

Dosage instruction format: `morning+noon+night` (e.g. `"1+0+1"` = 2 doses/day).

**Response** `200 application/json`

```json
{
  "total_dosages": [
    { "medicine_id": 42, "total_dosage": 13 }
  ]
}
```

> Total = sum of `(daily_doses × duration)` per medicine. Multiple items for the same `medicine_id` are accumulated.

**Errors** `400` invalid dosage instruction format.

---

## Cart Functionalities `/api/v1/cart`

### `POST /add_to_cart`

Adds a medicine to the patient's cart.

**Request body**

```json
{
  "medicine_id": 42,
  "count": 2,
  "order_status": "pending",
  "assigned_pharmacy": null,
  "patient_id": 3
}
```

| Field               | Type | Required | Default     | Description              |
|---------------------|------|----------|-------------|--------------------------|
| `medicine_id`       | int  | yes      | —           |                          |
| `count`             | int  | yes      | —           | Quantity                 |
| `order_status`      | str  | no       | `"pending"` |                          |
| `assigned_pharmacy` | int  | no       | `null`      | Pharmacy ID if pre-known |
| `patient_id`        | int  | yes      | —           |                          |

**Response** `200 application/json`

```json
{ "cart_id": 55 }
```

---

### `POST /remove_from_cart`

Deletes a cart item by its ID.

**Query parameters**

| Param     | Type | Required | Description  |
|-----------|------|----------|--------------|
| `cart_id` | int  | yes      | Cart row ID  |

**Response** `200 application/json`

```json
{ "message": "Cart item removed successfully" }
```

**Errors** `404` cart item not found.

---

### `GET /get_cart_items`

Lists all `pending` cart items for a patient, with assigned pharmacy name if set.

**Query parameters**

| Param        | Type | Required | Description   |
|--------------|------|----------|---------------|
| `patient_id` | int  | yes      | Patient row ID |

**Response** `200 application/json` — array of:

```json
[
  {
    "cart_id": 55,
    "medicine_id": 42,
    "count": 2,
    "order_status": "pending",
    "assigned_pharmacy_name": null,
    "patient_id": 3
  }
]
```

---

### `POST /checkout`

Assigns the closest pharmacy to each medicine in the cart, then marks them `confirmed`.

**Request body**

```json
{
  "patient_id": 3,
  "items": [
    { "medicine_id": 42, "count": 2 },
    { "medicine_id": 87, "count": 1 }
  ],
  "user_lat": 23.8103,
  "user_lng": 90.4125,
  "search_radius_meters": 5000.0
}
```

| Field                  | Type    | Required | Default    | Description                     |
|------------------------|---------|----------|------------|---------------------------------|
| `patient_id`           | int     | yes      | —          |                                 |
| `items`                | array   | yes      | —          | Medicines and quantities        |
| `user_lat`             | float   | yes      | —          | Current user latitude           |
| `user_lng`             | float   | yes      | —          | Current user longitude          |
| `search_radius_meters` | float   | no       | `5000.0`   | Search radius                   |

**Response** `200 application/json`

```json
{
  "status": "checkout_complete",
  "assignments": [
    {
      "medicine_id": 42,
      "pharmacy_id": 12,
      "pharmacy_name": "HealthPlus",
      "distance_meters": 320.5
    }
  ],
  "unassigned_medicine_ids": [87]
}
```

**Logic**
1. Resolves generic IDs for all medicines.
2. Calls `find_nearby_pharmacy` RPC once for all medicines.
3. Filters to exact matches with sufficient `stock_count`.
4. Assigns the nearest qualifying pharmacy per medicine (multi-stop strategy).
5. UPDATEs matching `cart` rows: `assigned_pharmacy`, `order_status = 'confirmed'`.
6. Any medicine with no qualifying pharmacy appears in `unassigned_medicine_ids`.

---

### `GET /past_orders`

Lists all non-pending (confirmed, delivered, etc.) orders for a patient.

**Query parameters**

| Param        | Type | Required | Description   |
|--------------|------|----------|---------------|
| `patient_id` | int  | yes      | Patient row ID |

**Response** `200 application/json` — same shape as `/get_cart_items`.

---

## Authentication `/api/v1/auth`

JWT-based auth. Tokens are HS256, valid for 7 days. Send authenticated requests with
`Authorization: Bearer <access_token>`.

Both sign-in endpoints return the same `AuthResponse` shape:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": { "id": "uuid-string", "email": "amanda@auramed.dev", "role": "Patient" },
  "patient": { "id": 3, "name": "Amanda Sterling" }
}
```

> `user.id` is a **string** (UUID). `patient` is `null` if the user has no linked patient row.

### `POST /register`

**Request body**

| Field      | Type | Required | Description                                                       |
|------------|------|----------|-------------------------------------------------------------------|
| `name`     | str  | yes      | ≥ 2 chars                                                         |
| `email`    | str  | yes      | Valid email; must be unique                                       |
| `password` | str  | yes      | ≥ 8 chars, with upper, lower, number, and special character       |

Creates a `users` row (role `Patient`) plus a linked `patients` row, then returns `AuthResponse`.

**Errors** `409` email already registered · `422` validation failure.

### `POST /login`

**Request body**: `{ "email": str, "password": str }` → `AuthResponse`.

**Errors** `401` invalid email or password.

### `GET /me`

Returns the current `AuthResponse` for the bearer token. Requires `Authorization` header.

**Errors** `401` missing/expired/invalid token · `404` user not found.

---

## Health Check

### `GET /`

```json
{ "status": "healthy", "service": "AuraMed Backend Entry" }
```