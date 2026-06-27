CREATE OR REPLACE FUNCTION match_medicines_by_symptom (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  medicine_id bigint,
  brand_name text,
  strength text,
  manufacturer_name text,
  generic_name text,
  similarity float
)
LANGUAGE plpgsql 
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id AS medicine_id,
    m.brand_name,
    m.strength,
    m.manufacturer_name,
    g.name AS generic_name,
    1 - (g.leaflet_embedding <=> query_embedding) AS similarity
  FROM public.medicines m
  JOIN public.generics g ON m.generic_id = g.id
  WHERE 1 - (g.leaflet_embedding <=> query_embedding) > match_threshold
  ORDER BY g.leaflet_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION match_medicines_by_name (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  medicine_id bigint,
  brand_name text,
  strength text,
  manufacturer_name text,
  generic_name text,
  similarity float
)
LANGUAGE plpgsql ACCESS ASYNC
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id AS medicine_id,
    m.brand_name,
    m.strength,
    m.manufacturer_name,
    g.name AS generic_name,
    1 - (m.medicine_search_embedding <=> query_embedding) AS similarity
  FROM public.medicines m
  JOIN public.generics g ON m.generic_id = g.id
  WHERE 1 - (m.medicine_search_embedding <=> query_embedding) > match_threshold
  ORDER BY m.medicine_search_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- unnest

CREATE OR REPLACE FUNCTION find_nearby_pharmacy (
  user_lat double precision,
  user_lng double precision,
  search_radius_meters double precision,
  target_medicine_ids bigint[],
  target_generic_ids bigint[],
  target_quantities int[],
  target_dosage_form_ids int[]
)
RETURNS TABLE (
  pharmacy_id bigint,
  pharmacy_name text,
  distance_meters double precision,
  available_medicine_id bigint,
  available_generic_id bigint,
  available_dosage_form_id bigint,
  stock_count int,
  is_exact_match boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_location geography;
BEGIN
  user_location := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

  RETURN QUERY
  -- ZIPPER TRICK: Convert the 4 arrays into a temporary "cart" table
  WITH cart AS (
    SELECT
      unnest(target_medicine_ids) AS req_med_id,
      unnest(target_generic_ids) AS req_gen_id,
      unnest(target_quantities) AS req_qty,
      unnest(target_dosage_form_ids) AS req_dosage_form_id
  )

  SELECT
    p.id AS pharmacy_id,
    p.store_name AS pharmacy_name,
    ST_Distance(p.coordinates, user_location) AS distance_meters,
    pi.medicine_id AS available_medicine_id,
    m.generic_id AS available_generic_id,
    m.dosage_form_id AS available_dosage_form_id,
    pi.stock_count,
    (pi.medicine_id = c.req_med_id) AS is_exact_match
  FROM public.pharmacies p
  JOIN public.pharmacy_inventory pi ON p.id = pi.pharmacy_id
  JOIN public.medicines m ON pi.medicine_id = m.id
  JOIN cart c ON (
    pi.medicine_id = c.req_med_id
    OR (m.generic_id = c.req_gen_id AND m.dosage_form_id = c.req_dosage_form_id)
  )

  WHERE
    pi.stock_count >= c.req_qty
    AND pi.is_recalled = false
    AND pi.expiry_date >= CURRENT_DATE
    AND ST_DWithin(p.coordinates, user_location, search_radius_meters)
  ORDER BY
    distance_meters ASC;
END;
$$;


CREATE OR REPLACE FUNCTION match_leaflets (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  target_generic_id bigint DEFAULT NULL
)
RETURNS TABLE (
  generic_id bigint,
  generic_name text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id AS generic_id,
    g.name AS generic_name,

    CONCAT_WS(E'\n\n',
      'INDICATIONS: ' || g.indication_description,
      'PHARMACOLOGY: ' || g.pharmacology_description,
      'DOSAGE & ADMINISTRATION: ' || g.dosage_description,
      'SIDE EFFECTS: ' || g.side_effects_description,
      'PREGNANCY & LACTATION: ' || g.pregnancy_and_lactation_description,
      'PRECAUTIONS: ' || g.precautions_description,
      'OVERDOSE: ' || g.overdose_effects_description
    ) AS content,
    1 - (g.leaflet_embedding <=> query_embedding) AS similarity
  FROM 
    public.generics g
  WHERE
    (target_generic_id IS NULL OR g.id = target_generic_id)
    AND 1 - (g.leaflet_embedding <=> query_embedding) > match_threshold
  ORDER BY
    g.leaflet_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION process_medicine_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reminder RECORD;
  resend_api_key text := 'resend api key'; 
  payload jsonb;
BEGIN
  FOR reminder IN 
    SELECT id, patient_email, medicine_name, schedule_time 
    FROM public.patient_reminders 
    WHERE status = 'pending' 
      AND schedule_time > NOW() 
      AND schedule_time <= (NOW() + INTERVAL '10 minutes')
  LOOP
    
    payload := jsonb_build_object(
      'from', 'Acme <onboarding@resend.dev>', 
      'to', reminder.patient_email,
      'subject', 'Medicine Reminder: ' || reminder.medicine_name,
      'html', '<p>Hi! It is almost time for your medicine.</p><p>Please take your <strong>' || reminder.medicine_name || '</strong> at ' || to_char(reminder.schedule_time, 'HH12:MI AM') || '.</p>'
    );

    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || resend_api_key
      )
    );
    
  END LOOP;
END;
$$;