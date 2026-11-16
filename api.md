# AuraMed API

Base: `/api/v1`. Swagger at `/docs`.

Auth: `Authorization: Bearer <jwt>` on every patient endpoint. The backend reads the patient from the token; **no endpoint accepts `patient_id` from the client any more.** Missing/expired token → `401`; non-patient account → `403`.

Gemini is only called for: symptom searches (cached per query), prescription OCR, and chat questions that aren't pure commands. Everything else is SQL + local Nomic embeddings.

## Auth `/auth`
| | |
|---|---|
| `POST /register` `{name,email,password}` | → `AuthResponse` `{access_token, user:{id,email,role}, patient:{id,name}}`. Password: 8+, upper, lower, digit, symbol. `409` if email exists. |
| `POST /login` `{email,password}` | → `AuthResponse`, `401` on bad creds |
| `GET /me` | → `AuthResponse` (used to validate stored sessions) |

## Medicines `/medicines`
| | |
|---|---|
| `GET /suggest?q=&limit=8` | Prefix match on brand + generic names. No AI. → `[{kind:"brand"\|"generic", label, medicine_id?, generic_id?, sub}]` |
| `GET /search-medicines?q=&limit=10` | If `q` prefix-matches a brand/generic → name embedding search (no Gemini). Otherwise Gemini classifies/expands (LRU cached), falls back to raw symptom embedding on failure. → `[{medicine_id, brand_name, strength, manufacturer_name, generic_name, similarity, dosage_form, unit_price}]` |
| `GET /fetch_medicine_details?medicine_id=` | → full leaflet incl. `generic_id, drug_class_name, dosage_form_id, unit_price, pack_price`. `404` if missing. |
| `GET /alternatives?medicine_id=&limit=20` | Other brands, same generic + dosage form, cheapest first. |

## Pharmacies `/pharmacies`
| | |
|---|---|
| `POST /search-pharmacies` `{user_lat,user_lng,search_radius_meters?,target_medicine_ids[],target_quantities?[]}` | → `{one_stop_options[], multi_stop_route[], missing_medicine_ids[], partial_matches[], target_names{}}`. One-stop = every target covered (exact or same-generic substitute). Route = per target the closest exact else closest substitute, stops ordered nearest-neighbour, each with `lat/lng` and `stop_order`. |
| `POST /check-pharmacy` `{pharmacy_id, medicine_ids[], quantities?[]}` | Stock at one pharmacy → `[{medicine_id, brand_name, in_stock, stock_count, substitutes[]}]` |
| `GET /search-by-name?q=` | → `[{pharmacy_id, pharmacy_name, lat, lng}]` |

## Cart `/cart` (auth)
| | |
|---|---|
| `GET /get_cart_items` | Pending items only, with `brand_name, strength, dosage_form, unit_price, assigned_pharmacy_name` |
| `POST /add_to_cart` `{medicine_id, count=1, assigned_pharmacy?}` | Merges into an existing pending row for the same medicine+pharmacy. `404` unknown medicine. → `{cart_id, merged}` |
| `POST /update_count` `{cart_id, count}` | |
| `POST /remove_from_cart?cart_id=` | |
| `POST /clear` | |
| `POST /calculate_total_cost` `{items:[{medicine_id,count}]}` | |
| `POST /checkout` `{user_lat?, user_lng?, search_radius_meters?}` | No coords → patient's `home_location`. In one transaction: picks user-chosen pharmacy if stocked else nearest exact match, decrements `pharmacy_inventory` (earliest expiry first), inserts `sales_records`, marks rows `confirmed` with `ordered_at`. Unstocked items stay pending. → `{status: checkout_complete\|partial\|nothing_available, assignments[], unassigned[], total_cost}` |
| `GET /past_orders` | Grouped by `(ordered_at minute, pharmacy)` → `[{ordered_at, pharmacy_name, status, items[], total}]` |

## Patient `/patient_page` (auth)
| | |
|---|---|
| `GET /get_patient` | `home_location` may be null |
| `PUT /home_location` `{latitude, longitude}` | |
| `GET /get_prescriptions` | Newest first, `[]` when none. Items joined with brand/generic/strength/form, plus `dose:[m,n,e]` parsed from the instruction and `reminders_set`. Unlinked items keep `medicine_name`. |
| `POST /calculate_dosage` `{items:[{medicine_id,dosage_instruction,duration}]}` | Accepts `1+0+1`, `1-0-1 • After food`, `Napa: ½-0-0`, `1/2+0+1`. → `{total_dosages:[{medicine_id,total_dosage,per_day}]}` |
| `POST /reminders` `{prescription_id, times?:{morning,noon,night}, start_date?}` | Expands dose × duration into `patient_reminders` rows in Asia/Dhaka, to the account email. Idempotent (replaces pending rows for that prescription). → `{created}` |
| `GET /reminders` | Upcoming pending reminders |
| `DELETE /reminders/{prescription_id}` | |

Email sending: pg_cron `*/5 * * * *` → `process_medicine_reminders()` (see `migrations/001_fixes.sql`). Groups same-time doses into one email, marks `status='sent'`, reads the Resend key from Vault (`resend_api_key`).

## Prescriptions `/prescriptions` (auth except the two lookups)
| | |
|---|---|
| `GET /dosage_forms` | |
| `GET /medicine_variants?brand_name=` | |
| `POST /scan` multipart `file` | Gemini OCR → `{doctor_name, doctor_specialization, disease_diagnosis, raw_ocr_text, medicines:[ScannedMedicine]}`. Each medicine is matched by name embedding, variant picked by strength/form, `dosage_instruction` normalised to `"1+0+1 • After food"`. Nothing is saved. |
| `POST /save_prescription` `{doctor_name?, doctor_specialization?, disease_diagnosis?, raw_ocr_text?, medicines:[{medicine_id?, medicine_name?, dosage_form_id?, dosage_instruction, duration_days}]}` | → `{prescription_id, doctor_id, item_count}` |
| `PUT /{prescription_id}` same body | Replaces items |
| `POST /add_prescription_from_qr?id=` | Claims a prescription only if it has no patient yet |
| `POST /remove_prescription?id=` | |

## Appointments `/appointments`
| | |
|---|---|
| `GET /search?q=` | Doctors with future slots that still have capacity → `[{id,name,specialization,slots:[{id,date,time_slot,available_slots,hospital_id,hospital_name,hospital_contact}]}]` |
| `POST /book` `{availability_id}` (auth) | Atomic decrement; `400` when full, `409` if already booked that slot. Time derived server-side from `time_slot`. |
| `POST /{id}/cancel` (auth) | Releases the slot |
| `GET /my-appointments?status=upcoming\|past` (auth) | Includes `time_slot, status, hospital_name, hospital_contact` |

## Chat `/chat`
`POST /chatbot` `{user_question, generic_id?, history?:[{role,text}]}` → `text/event-stream`, each frame `data: {json}`:
- `{"route": "/cart", "t": "Opening your cart…"}` for navigation commands (regex, no Gemini) — e.g. "open my cart", "book a cardiologist", "find pharmacy for napa", "search napa", "scan prescription", "reminders", "dosage calculator".
- `{"sources": ["Paracetamol"]}` then `{"t": "..."}` chunks for leaflet-grounded answers. The leaflet is chosen by `generic_id`, else by a brand/generic name found in the question, else top-3 semantic match.
- Red-flag symptoms get an emergency message without calling Gemini.
- `{"done": true}` always last.
