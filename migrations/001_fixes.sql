-- AuraMed overhaul migration. Shob additive, purono data thake.
-- Run: python migrations/run.py  (ba Supabase SQL editor e paste koro)

-- ── reminders: prescription er sathe link + dose label ──
alter table public.patient_reminders
  add column if not exists patient_id bigint references public.patients(id) on delete cascade,
  add column if not exists prescription_id bigint references public.prescriptions(id) on delete cascade,
  add column if not exists dose_label text,
  add column if not exists sent_at timestamptz;

create index if not exists idx_reminders_due
  on public.patient_reminders (status, schedule_time);

-- ── OCR item jodi DB te match na kore, naam ta tobu rakhi ──
alter table public.prescription_items
  add column if not exists medicine_name text;

-- ── appointments: kon hospital, kon slot, status ──
alter table public."Appointments"
  add column if not exists hospital_id bigint references public.hospitals(id),
  add column if not exists availability_id bigint references public.hospital_doctor_availability(id),
  add column if not exists time_slot text,
  add column if not exists status text not null default 'booked',
  add column if not exists created_at timestamptz default now();

-- ek patient ek slot e duibar book korte parbe na (cancel korle abar parbe)
create unique index if not exists uniq_patient_active_slot
  on public."Appointments" (patient_id, availability_id)
  where status = 'booked';

-- ── cart: kokhon order hoise ──
alter table public.patient_cart
  add column if not exists created_at timestamptz default now(),
  add column if not exists ordered_at timestamptz;

-- ── brand prefix suggest er jonno ──
create index if not exists idx_medicines_brand_lower
  on public.medicines (lower(brand_name) text_pattern_ops);
create index if not exists idx_generics_name_lower
  on public.generics (lower(name) text_pattern_ops);

-- ── resend key vault e rakhbo, function er vitor hardcode na ──
-- (run.py ei secret ta purono function theke copy kore dey)

-- ── reminder sender: ekbar e pathay, status update kore, Dhaka time dekhay ──
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

-- ── pharmacy finder: batch gulo sum kore stock dekhi ──
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
