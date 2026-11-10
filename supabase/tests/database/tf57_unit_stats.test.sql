-- ============================================================================
-- TF-57: ผลงานหน่วย + ด่านกันปั๊มผลงาน
-- นับถูกทุกแบบ (ช่วยสำเร็จ / ปิดโดยหัวหน้า / ปล่อยเคส / ส่งต่อ = 0) ไม่นับซ้ำ, close_confirmation ว่างไม่นับ,
-- ติดด่านไม่นับจนแอดมินผ่าน, หน่วยชื่อเดียวกันต่างเขตแยกกัน, คนนอกหน่วย/anon อ่านไม่ได้, ไม่มีเบอร์
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

-- ผู้ใช้: 1 A กู้ภัย U1 (เบอร์ 0811110001) / 2 L หัวหน้า U1 / 3 B กู้ภัย U2 / 4 แอดมิน / 5 N ไม่มีหน่วย
insert into auth.users(id)
  select ('a5700000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 5) g;
insert into public.users(id, auth_user_id, display_name, role, status, phone)
  select ('b5700000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a5700000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf57-' || g,
         (case g when 2 then 'UNIT_LEAD' when 4 then 'ADMIN' else 'RESCUER' end)::public.user_role,
         'ACTIVE', '081-111-000' || g
  from generate_series(1, 5) g;
-- หน่วยชื่อเดียวกัน คนละเขต
insert into public.units(id, name, province, district) values
  ('c5700000-0000-0000-0000-000000000001', 'TF57 กู้ภัยสามัคคี', 'สตูล', 'เมืองสตูล'),
  ('c5700000-0000-0000-0000-000000000002', 'TF57 กู้ภัยสามัคคี', 'สตูล', 'ละงู');
insert into public.unit_members(unit_id, user_id, role_in_unit, status) values
  ('c5700000-0000-0000-0000-000000000001', 'b5700000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED'),
  ('c5700000-0000-0000-0000-000000000001', 'b5700000-0000-0000-0000-000000000002', 'LEAD', 'APPROVED'),
  ('c5700000-0000-0000-0000-000000000002', 'b5700000-0000-0000-0000-000000000003', 'MEMBER', 'APPROVED');

-- เคสที่เดินครบขั้นแล้วปิด: confirmation null = ปิดนอกขั้นตอน TF-58
create function pg_temp.closed_case(
  code text, unit_no int, confirmation text, minutes_to_finish int, reporter_phone text, people int
) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_unit uuid := ('c5700000-0000-0000-0000-00000000000' || unit_no)::uuid;
  v_rescuer uuid := case unit_no when 1 then 'b5700000-0000-0000-0000-000000000001'::uuid
                                 else 'b5700000-0000-0000-0000-000000000003'::uuid end;
begin
  insert into public.cases(case_code, urgency, lat, lng, landmark, province, incident_type)
  values (code, 'YELLOW', 6.62, 100.07, 'หน้าวัด', 'สตูล', 'FLOOD') returning id into v_id;
  insert into public.case_contacts(case_id, name, phone, phone_last4)
  values (v_id, 'ผู้แจ้ง', reporter_phone, right(regexp_replace(reporter_phone, '\D', '', 'g'), 4));
  update public.cases set status = 'ACCEPTED', assigned_unit_id = v_unit, assigned_rescuer_id = v_rescuer,
    accepted_at = now() - make_interval(mins => minutes_to_finish + 10) where id = v_id;
  update public.cases set status = 'EN_ROUTE' where id = v_id;
  update public.cases set status = 'ON_SITE' where id = v_id;
  update public.cases set status = 'AWAITING_CONFIRMATION' where id = v_id;
  insert into public.case_events(case_id, event_type, from_status, to_status, actor_unit_id, metadata, created_at)
  values (v_id, 'STATUS_CHANGED', 'ON_SITE', 'AWAITING_CONFIRMATION', v_unit,
          jsonb_build_object('outcome', 'HELPED', 'peopleHelped', people),
          now() - make_interval(mins => 10));
  perform set_config('app.case_close_by_lead', 'on', true);
  update public.cases set status = 'RESOLVED', close_confirmation = confirmation,
    resolved_at = now(), closed_at = now() where id = v_id;
  perform set_config('app.case_close_by_lead', '', true);
  return v_id;
end $$;
create function pg_temp.stat(unit_no int, col text) returns int language plpgsql as $$
declare v int;
begin
  execute format('select coalesce(sum(%I), 0)::int from public.unit_daily_stats where unit_id = $1', col)
    into v using ('c5700000-0000-0000-0000-00000000000' || unit_no)::uuid;
  return v;
end $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a5700000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
grant execute on function pg_temp.stat(int, text), pg_temp.as_user(int) to authenticated;

select pg_temp.closed_case('TF57-H1', 1, 'REPORTER_CONFIRMED', 30, '0899990001', 3);
select pg_temp.closed_case('TF57-L1', 1, 'LEAD_UNCONFIRMED', 30, '0899990002', 2);
select pg_temp.closed_case('TF57-N1', 1, null, 30, '0899990003', 5);
select pg_temp.closed_case('TF57-P1', 1, 'REPORTER_CONFIRMED', 30, '+66 81 111 0001', 4);
select pg_temp.closed_case('TF57-F1', 1, 'REPORTER_CONFIRMED', 2, '0899990004', 1);
select pg_temp.closed_case('TF57-H2', 2, 'REPORTER_CONFIRMED', 30, '0899990005', 6);
-- ปล่อยเคส: นับตามหน่วยที่ปล่อย
insert into public.case_events(case_id, event_type, from_status, to_status, actor_unit_id, actor_role, note)
  select id, 'RELEASED', 'ACCEPTED', 'NEW', 'c5700000-0000-0000-0000-000000000001', 'RESCUER', 'เรือเสีย'
  from public.cases where case_code = 'TF57-H1';

-- ---------- 1. ด่านกันปั๊มผลงาน ----------
select is((select reasons from public.case_performance_reviews r join public.cases c on c.id = r.case_id
  where c.case_code = 'TF57-P1'), array['REPORTER_IS_MEMBER'],
  'เบอร์ผู้แจ้ง (+66) ตรงกับเบอร์สมาชิกหน่วยที่ปิดเคส ติดด่าน');
select is((select reasons from public.case_performance_reviews r join public.cases c on c.id = r.case_id
  where c.case_code = 'TF57-F1'), array['TOO_FAST'], 'รับเคสถึงช่วยเสร็จไม่ถึง 5 นาที ติดด่าน');
select is((select count(*)::int from public.case_performance_reviews r join public.cases c on c.id = r.case_id
  where c.case_code in ('TF57-H1', 'TF57-L1', 'TF57-H2')), 0, 'เคสปกติไม่ติดด่าน');
select is((select r.status from public.case_performance_reviews r join public.cases c on c.id = r.case_id
  where c.case_code = 'TF57-P1'), 'PENDING', 'ติดด่านแล้วรอแอดมินตรวจ');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'case_performance_reviews' and column_name ilike '%phone%'), 0,
  'ตารางด่านไม่มีคอลัมน์เบอร์');

-- ---------- 2. นับถูกทุกแบบ ไม่นับซ้ำ (มองแบบแอดมิน) ----------
set local role authenticated;
select pg_temp.as_user(4);
select is(pg_temp.stat(1, 'helped'), 1, 'ช่วยสำเร็จ U1 = 1 (นับแค่ H1: ไม่นับเคสที่ close_confirmation ว่าง และเคสติดด่าน)');
select is(pg_temp.stat(1, 'lead_closed'), 1, 'ปิดโดยหัวหน้า U1 = 1 (L1)');
select is(pg_temp.stat(1, 'released'), 1, 'ปล่อยเคส U1 = 1');
select is(pg_temp.stat(1, 'referred'), 0, 'ส่งต่อ = 0 (TODO TF-59)');
select is(pg_temp.stat(1, 'people_helped'), 5, 'จำนวนคนที่ช่วยได้ = H1 (3) + L1 (2) ไม่รวมเคสที่ไม่นับ');
select is(pg_temp.stat(2, 'helped'), 1, 'หน่วยชื่อเดียวกันต่างเขต (U2) นับแยก');
select is(pg_temp.stat(2, 'people_helped'), 6, 'จำนวนคนของ U2 แยกจาก U1');
select is((select sum(helped + lead_closed)::int from public.unit_daily_stats
  where unit_id = 'c5700000-0000-0000-0000-000000000001'), 2, 'เคสหนึ่งนับได้ช่องเดียว (ช่วยสำเร็จ หรือ ปิดโดยหัวหน้า)');
select set_eq(
  $$select unit_id, date_trunc('month', day)::date as m, sum(helped)::int as h, sum(lead_closed)::int as l,
      sum(released)::int as r, sum(referred)::int as f, sum(people_helped)::int as p from public.unit_daily_stats
    where unit_id::text like 'c57%' group by 1, 2$$,
  $$select unit_id, month as m, sum(helped)::int as h, sum(lead_closed)::int as l, sum(released)::int as r,
      sum(referred)::int as f, sum(people_helped)::int as p from public.unit_monthly_stats
    where unit_id::text like 'c57%' group by 1, 2$$,
  'unit_monthly_stats รวมจาก unit_daily_stats ตรงกัน');
select is((select day from public.unit_daily_stats where unit_id = 'c5700000-0000-0000-0000-000000000001' and helped > 0),
  (now() at time zone 'Asia/Bangkok')::date, 'วันที่นับตามเวลาไทย');

-- ---------- 3. แอดมินผ่าน/ไม่ผ่าน ----------
select pg_temp.as_user(2);
select throws_ok($$select public.review_case_performance((select case_id from public.case_performance_reviews limit 1), 'APPROVE')$$,
  '42501', null, 'หัวหน้าหน่วยกดผ่านด่านเองไม่ได้');
select throws_ok($$select * from public.pending_performance_reviews()$$, '42501', null,
  'หัวหน้าหน่วยดูคิวด่านไม่ได้');
select pg_temp.as_user(4);
select is((select count(*)::int from public.pending_performance_reviews() where case_code like 'TF57-%'), 2,
  'แอดมินเห็นคิวเคสติดด่าน 2 เคส');
reset role;
create temp table ids as select case_code, id from public.cases where case_code like 'TF57-%';
grant select on ids to authenticated;
set local role authenticated;
select pg_temp.as_user(4);
select is(public.review_case_performance((select id from ids where case_code = 'TF57-F1'), 'APPROVE', 'ตรวจแล้ว ใกล้จุดจริง'),
  'APPROVED', 'แอดมินกดผ่านเคสที่เร็วผิดปกติ');
select is(public.review_case_performance((select id from ids where case_code = 'TF57-P1'), 'REJECT', 'ผู้แจ้งเป็นสมาชิกเอง'),
  'REJECTED', 'แอดมินกดไม่ผ่านเคสที่ผู้แจ้งเป็นสมาชิก');
select is(pg_temp.stat(1, 'helped'), 2, 'ผ่านด่านแล้วนับ (H1 + F1) · ไม่ผ่านยังไม่นับ (P1)');
select throws_ok($$select public.review_case_performance((select id from ids where case_code = 'TF57-F1'), 'REJECT')$$,
  '22023', null, 'ตรวจแล้วตรวจซ้ำไม่ได้');
reset role;
select is((select count(*)::int from public.audit_logs where action in ('CASE_PERFORMANCE_APPROVED', 'CASE_PERFORMANCE_REJECTED')
  and case_id in (select id from ids)), 2, 'ทุกการตัดสินบันทึก audit_logs');

-- ---------- 4. ใครเห็นอะไร ----------
set local role authenticated;
select pg_temp.as_user(1);
select is((select array_agg(distinct unit_id::text) from public.unit_daily_stats where unit_id::text like 'c57%'),
  array['c5700000-0000-0000-0000-000000000001'], 'สมาชิก U1 เห็นเฉพาะหน่วยตัวเอง');
select is((select count(*)::int from public.unit_monthly_stats where unit_id = 'c5700000-0000-0000-0000-000000000002'), 0,
  'สมาชิก U1 อ่านสถิติรายเดือนของหน่วยอื่น (ชื่อเดียวกัน) ไม่ได้');
select pg_temp.as_user(5);
select is((select count(*)::int from public.unit_daily_stats), 0, 'คนที่ไม่มีหน่วยอ่านสถิติไม่ได้');
select throws_ok($$select * from rls.unit_case_outcomes$$, '42501', null,
  'ผู้ใช้อ่าน rls.unit_case_outcomes ตรงไม่ได้');
reset role;
set local role anon;
select throws_ok($$select * from public.unit_daily_stats$$, '42501', null, 'anon อ่าน unit_daily_stats ไม่ได้');
select throws_ok($$select * from public.unit_monthly_stats$$, '42501', null, 'anon อ่าน unit_monthly_stats ไม่ได้');
select throws_ok($$select * from rls.unit_case_outcomes$$, '42501', null, 'anon อ่าน rls.unit_case_outcomes ไม่ได้');

-- ---------- 5. ยอดรวมสาธารณะ (TF-61) ----------
select is((select count(*)::int from public.public_unit_daily_helped('c5700000-0000-0000-0000-000000000001')), 30,
  'anon ดูยอดรวม 30 วันได้ (วันละแถว)');
select is((select array[sum(helped), sum(lead_closed)]::int[] from public.public_unit_daily_helped('c5700000-0000-0000-0000-000000000001', 7)),
  array[2, 1], 'ยอดรวมสาธารณะแยกช่วยสำเร็จ / ปิดโดยหัวหน้า เฉพาะเคสที่ผ่านด่าน');
select throws_ok($$select * from public.public_unit_daily_helped('c5700000-0000-0000-0000-000000000001', 0)$$,
  '22023', null, 'p_days ต่ำกว่า 1 ไม่ได้');
select throws_ok($$select * from public.public_unit_daily_helped('c5700000-0000-0000-0000-000000000001', 366)$$,
  '22023', null, 'p_days เกิน 365 ไม่ได้');
reset role;

-- ---------- 6. view และ RPC สาธารณะไม่มีเบอร์ ----------
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name in ('unit_daily_stats', 'unit_monthly_stats')
    and column_name ilike '%phone%'), 0, 'view ทั้ง 2 ตัวไม่มีคอลัมน์เบอร์');
select is((select pg_get_function_result('public.public_unit_daily_helped(uuid, integer)'::regprocedure)),
  'TABLE(day date, helped integer, lead_closed integer)', 'RPC สาธารณะคืนแค่วันที่และยอดรวม');

select * from finish();
rollback;
