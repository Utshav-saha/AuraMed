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
    1 - (m.medicine_search_embedding <=> query_embedding) AS similarity
  FROM public.medicines m
  JOIN public.generics g ON m.generic_id = g.id
  WHERE 1 - (m.medicine_search_embedding <=> query_embedding) > match_threshold
  ORDER BY m.medicine_search_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- unnest

create or replace function public.find_nearby_pharmacy (
  user_lat double precision,
  user_lng double precision,
  search_radius_meters double precision,
  target_medicine_ids bigint[],
  target_generic_ids bigint[],
  target_quantities int[],
  target_dosage_form_ids int[]
)
returns table (
  pharmacy_id bigint,
  pharmacy_name text,
  distance_meters double precision,
  available_medicine_id bigint,
  available_generic_id bigint,
  available_dosage_form_id bigint,
  stock_count int,
  is_exact_match boolean
)
language plpgsql
as $$
declare
  user_location geography;
begin
  user_location := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

  return query
  with cart as (
    select
      unnest(target_medicine_ids) as req_med_id,
      unnest(target_generic_ids) as req_gen_id,
      unnest(target_quantities) as req_qty,
      unnest(target_dosage_form_ids) as req_dosage_form_id
  ),
  stock as (
    select pi.pharmacy_id, pi.medicine_id, sum(pi.stock_count)::int as total
    from public.pharmacy_inventory pi
    where pi.is_recalled = false and pi.expiry_date >= current_date
    group by pi.pharmacy_id, pi.medicine_id
  )
  select
    p.id,
    p.store_name,
    ST_Distance(p.coordinates, user_location),
    s.medicine_id,
    m.generic_id,
    m.dosage_form_id,
    s.total,
    (s.medicine_id = c.req_med_id)
  from public.pharmacies p
  join stock s on s.pharmacy_id = p.id
  join public.medicines m on m.id = s.medicine_id
  join cart c on (
    s.medicine_id = c.req_med_id
    or (m.generic_id = c.req_gen_id and m.dosage_form_id = c.req_dosage_form_id)
  )
  where s.total >= c.req_qty
    and ST_DWithin(p.coordinates, user_location, search_radius_meters)
  order by 3 asc;
end;
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


create or replace function public.process_medicine_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grp record;
  api_key text;
  payload jsonb;
  lines text;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets where name = 'resend_api_key' limit 1;

  if api_key is null then
    raise notice 'resend_api_key vault e nai, skip';
    return;
  end if;

  -- same email + same minute er dose gulo ek mail e
  for grp in
    with due as (
      select id, patient_email, medicine_name, schedule_time, dose_label
      from public.patient_reminders
      where status = 'pending'
        and schedule_time between now() - interval '5 minutes' and now() + interval '10 minutes'
      for update skip locked
    )
    select patient_email,
           date_trunc('minute', schedule_time) as at,
           max(dose_label) as dose_label,
           array_agg(id) as ids,
           string_agg(medicine_name, ', ' order by medicine_name) as meds
    from due
    group by patient_email, date_trunc('minute', schedule_time)
  loop
    lines := '<p>It is almost time for your ' || coalesce(grp.dose_label, '') || ' dose.</p>'
          || '<p><strong>' || grp.meds || '</strong></p>'
          || '<p>Scheduled at ' || to_char(grp.at at time zone 'Asia/Dhaka', 'HH12:MI AM') || ' (Dhaka time).</p>'
          || '<p style="color:#777;font-size:12px">AuraMed reminder</p>';

    payload := jsonb_build_object(
      'from', 'AuraMed <onboarding@resend.dev>',
      'to', grp.patient_email,
      'subject', 'Medicine reminder: ' || grp.meds,
      'html', lines
    );

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || api_key
      )
    );

    update public.patient_reminders
      set status = 'sent', sent_at = now()
      where id = any(grp.ids);
  end loop;
end;
$$;
