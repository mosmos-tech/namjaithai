-- ============================================================================
-- TF-57: Dashboard ผลงานหน่วย + ด่านกันปั๊มผลงาน
--   1. case_performance_reviews: เคสที่ติดด่าน ไม่นับผลงานจนกว่าแอดมินผ่าน
--      ตรวจตอนเคสปิดเป็น RESOLVED (trigger) — เทียบเบอร์ในฐานข้อมูลเท่านั้น เก็บแค่รหัสเหตุผล ไม่เก็บเบอร์
--   2. rls.unit_case_outcomes: ผลลัพธ์ต่อเคส (view ภายใน ไม่มีใครอ่านตรงได้)
--   3. unit_daily_stats / unit_monthly_stats: เห็นเฉพาะหน่วยที่ตัวเองอยู่ (แอดมินเห็นทุกหน่วย)
--   4. public_unit_daily_helped(): ยอดรวมต่อวันให้หน้าสาธารณะ TF-61 (ไม่มีรายเคส)
--   5. แอดมินดูคิวและกดผ่าน/ไม่ผ่าน (audit_logs)
-- ผลงานนับให้หน่วยที่ปิดเคส (assigned_unit_id ตอนปิด) · วันตามเวลาไทย
-- นับเฉพาะ close_confirmation ที่ TF-58 บันทึก: REPORTER_CONFIRMED = ช่วยสำเร็จ, LEAD_UNCONFIRMED = ปิดโดยหัวหน้า
-- RESOLVED ที่ close_confirmation ว่าง (ปิดนอกขั้นตอน TF-58) ไม่นับเป็นผลงาน
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ด่านกันปั๊มผลงาน
-- ----------------------------------------------------------------------------
create table public.case_performance_reviews (
  case_id uuid primary key references public.cases(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  -- REPORTER_IS_MEMBER / TOO_FAST (TODO(TF-28): FAR_FROM_SCENE)
  reasons text[] not null check (cardinality(reasons) > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.case_performance_reviews is
  'TF-57 เคสที่ติดด่านกันปั๊มผลงาน — ไม่นับผลงานจนกว่าแอดมินผ่าน (ไม่มีเบอร์โทรในตารางนี้)';
alter table public.case_performance_reviews enable row level security;
revoke all on public.case_performance_reviews from public, anon, authenticated;
grant select on public.case_performance_reviews to authenticated;
create policy "admin reads performance reviews" on public.case_performance_reviews
  for select to authenticated using ((select rls.is_admin()));

-- เบอร์ไทยเหลือแต่ตัวเลข (+66 / 66 → 0) ใช้เทียบภายในเท่านั้น
create function rls.normalize_th_phone(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^66\d{8,9}$' then '0' || substr(d, 3)
    else nullif(d, '')
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x
$$;

create function rls.check_case_performance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reasons text[] := '{}';
  v_finished_at timestamptz;
begin
  -- (1) ผู้แจ้งคือสมาชิกหน่วยที่ปิดเคสเอง
  if exists (
    select 1
    from public.case_contacts cc
    join public.unit_members m on m.unit_id = new.assigned_unit_id and m.status = 'APPROVED'
    join public.users u on u.id = m.user_id
    where cc.case_id = new.id
      and rls.normalize_th_phone(cc.phone) is not null
      and rls.normalize_th_phone(cc.phone) = rls.normalize_th_phone(u.phone)
  ) then
    v_reasons := array_append(v_reasons, 'REPORTER_IS_MEMBER');
  end if;

  -- (2) TODO(TF-28): ตำแหน่งกู้ภัยตอนกด "ถึงที่เกิดเหตุ" ห่างจากเคสเกิน 1 กม. → FAR_FROM_SCENE
  --     (ยังไม่มีตำแหน่งกู้ภัยจนกว่า TF-28 แชร์ตำแหน่งจะเสร็จ)

  -- (3) จากรับเคสถึงกด "ช่วยเสร็จแล้ว" ไม่ถึง 5 นาที
  select max(e.created_at) into v_finished_at
  from public.case_events e
  where e.case_id = new.id and e.event_type = 'STATUS_CHANGED' and e.to_status = 'AWAITING_CONFIRMATION';
  if new.accepted_at is not null and v_finished_at is not null
     and v_finished_at - new.accepted_at < interval '5 minutes' then
    v_reasons := array_append(v_reasons, 'TOO_FAST');
  end if;

  if cardinality(v_reasons) > 0 then
    insert into public.case_performance_reviews(case_id, unit_id, reasons)
    values (new.id, new.assigned_unit_id, v_reasons)
    on conflict (case_id) do update
      set unit_id = excluded.unit_id, reasons = excluded.reasons, status = 'PENDING',
          reviewed_by = null, reviewed_at = null, note = null, created_at = now();
  end if;
  return new;
end;
$$;
revoke all on function rls.check_case_performance() from public, anon, authenticated;

create trigger trg_case_performance_check
  after update of status on public.cases
  for each row
  when (new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' and new.assigned_unit_id is not null)
  execute function rls.check_case_performance();

-- ----------------------------------------------------------------------------
-- 2. ผลลัพธ์ต่อเคส (ภายใน) — ไม่มีเบอร์ ไม่มีรหัสเคส
-- ----------------------------------------------------------------------------
-- เป็น view ไม่ใช่ฟังก์ชัน: Postgres ตรวจสิทธิ์เรียกฟังก์ชันใน view ด้วยสิทธิ์ของคนอ่าน (ต้อง grant = เรียกตรงได้)
-- ส่วน view ซ้อน view ตรวจด้วยสิทธิ์ของเจ้าของ view ชั้นนอก — ไม่ grant ให้ใคร จึงอ่านตรงไม่ได้
create view rls.unit_case_outcomes as
  -- ช่วยสำเร็จ / ปิดโดยหัวหน้า: 1 เคสนับได้ช่องเดียว นับให้หน่วยที่ปิดเคส ผ่านด่านเท่านั้น
  select c.assigned_unit_id as unit_id,
         (c.resolved_at at time zone 'Asia/Bangkok')::date as day,
         c.incident_type::text as incident_type,
         (c.close_confirmation = 'REPORTER_CONFIRMED')::int as helped,
         (c.close_confirmation = 'LEAD_UNCONFIRMED')::int as lead_closed,
         0 as referred, 0 as released,
         coalesce(c.rescued_count, (
           select (e.metadata ->> 'peopleHelped')::int from public.case_events e
           where e.case_id = c.id and e.event_type = 'STATUS_CHANGED'
             and e.to_status = 'AWAITING_CONFIRMATION'
           order by e.created_at desc limit 1
         ), 0) as people_helped
  from public.cases c
  where c.status = 'RESOLVED'
    and c.assigned_unit_id is not null
    and c.resolved_at is not null
    and c.close_confirmation in ('REPORTER_CONFIRMED', 'LEAD_UNCONFIRMED')
    and not exists (
      select 1 from public.case_performance_reviews r
      where r.case_id = c.id and r.status <> 'APPROVED'
    )
  union all
  -- ปล่อยเคส: หน่วยที่ปล่อย ณ วันที่ปล่อย (ไม่ใช่ผลงาน จึงไม่ผ่านด่าน)
  select e.actor_unit_id, (e.created_at at time zone 'Asia/Bangkok')::date, c.incident_type::text,
         0, 0, 0, 1, 0
  from public.case_events e
  join public.cases c on c.id = e.case_id
  where e.event_type = 'RELEASED' and e.actor_unit_id is not null
  -- TODO(TF-59): union all เคสที่ส่งต่อออกไป (referred = 1) — คอลัมน์ referred มีในทุก view แล้ว หน้าเว็บไม่ต้องแก้
  ;
revoke all on rls.unit_case_outcomes from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. view สถิติ — owner อ่านทุกหน่วยได้ จึงกรองด้วยสิทธิ์ของคนที่อ่านใน WHERE
-- ----------------------------------------------------------------------------
create view public.unit_daily_stats as
  select o.unit_id, o.day, o.incident_type,
         sum(o.helped)::int as helped,
         sum(o.lead_closed)::int as lead_closed,
         sum(o.referred)::int as referred,
         sum(o.released)::int as released,
         sum(o.people_helped)::int as people_helped
  from rls.unit_case_outcomes o
  where rls.is_admin() or o.unit_id in (select rls.my_unit_ids())
  group by o.unit_id, o.day, o.incident_type;
comment on view public.unit_daily_stats is
  'TF-57 ผลงานหน่วยต่อวันต่อประเภทเหตุ นับเฉพาะเคสที่ผ่านด่าน — เห็นเฉพาะหน่วยที่ตัวเองอยู่ / แอดมิน';

create view public.unit_monthly_stats as
  select d.unit_id, date_trunc('month', d.day)::date as month, d.incident_type,
         sum(d.helped)::int as helped,
         sum(d.lead_closed)::int as lead_closed,
         sum(d.referred)::int as referred,
         sum(d.released)::int as released,
         sum(d.people_helped)::int as people_helped
  from public.unit_daily_stats d
  group by d.unit_id, date_trunc('month', d.day), d.incident_type;
comment on view public.unit_monthly_stats is 'TF-57 ผลงานหน่วยต่อเดือนต่อประเภทเหตุ (จาก unit_daily_stats)';

revoke all on public.unit_daily_stats, public.unit_monthly_stats from public, anon, authenticated;
grant select on public.unit_daily_stats, public.unit_monthly_stats to authenticated;

-- ----------------------------------------------------------------------------
-- 4. ยอดรวมสาธารณะสำหรับ TF-61 — ไม่มีรายเคส ประเภทเหตุ หรือเบอร์
-- ----------------------------------------------------------------------------
create function public.public_unit_daily_helped(p_unit_id uuid, p_days integer default 30)
returns table(day date, helped integer, lead_closed integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'p_days must be between 1 and 365' using errcode = '22023';
  end if;
  return query
    select g.day::date,
           coalesce(sum(o.helped), 0)::int,
           coalesce(sum(o.lead_closed), 0)::int
    from generate_series(v_today - (p_days - 1), v_today, interval '1 day') g(day)
    left join rls.unit_case_outcomes o on o.unit_id = p_unit_id and o.day = g.day::date
    where exists (select 1 from public.units u where u.id = p_unit_id)
    group by g.day
    order by g.day;
end;
$$;
revoke all on function public.public_unit_daily_helped(uuid, integer) from public;
grant execute on function public.public_unit_daily_helped(uuid, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. แอดมิน: คิวเคสติดด่าน + กดผ่าน/ไม่ผ่าน
-- ----------------------------------------------------------------------------
create function public.pending_performance_reviews()
returns table(case_id uuid, case_code text, unit_id uuid, unit_name text, reasons text[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rls.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select r.case_id, c.case_code, r.unit_id, u.name, r.reasons, r.created_at
    from public.case_performance_reviews r
    join public.cases c on c.id = r.case_id
    join public.units u on u.id = r.unit_id
    where r.status = 'PENDING'
    order by r.created_at;
end;
$$;

create function public.review_case_performance(p_case_id uuid, p_decision text, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := rls.current_user_id();
  v_status text;
  v_review public.case_performance_reviews%rowtype;
begin
  if v_actor is null or not rls.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_status := case p_decision when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' end;
  if v_status is null then
    raise exception 'decision must be APPROVE or REJECT' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'note must be at most 300 characters' using errcode = '22023';
  end if;
  update public.case_performance_reviews
  set status = v_status, reviewed_by = v_actor, reviewed_at = now(), note = nullif(btrim(p_note), '')
  where case_id = p_case_id and status = 'PENDING'
  returning * into v_review;
  if not found then
    raise exception 'review not pending' using errcode = '22023';
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, case_id, metadata)
  values (v_actor, 'CASE_PERFORMANCE_' || v_status, 'case', p_case_id, p_case_id,
          jsonb_build_object('unit_id', v_review.unit_id, 'reasons', v_review.reasons, 'note', v_review.note));
  return v_status;
end;
$$;

revoke all on function public.pending_performance_reviews() from public, anon;
revoke all on function public.review_case_performance(uuid, text, text) from public, anon;
grant execute on function public.pending_performance_reviews() to authenticated;
grant execute on function public.review_case_performance(uuid, text, text) to authenticated;
