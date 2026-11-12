-- ============================================================================
-- TF-42: หน้าติดตามของผู้แจ้งเห็นตำแหน่งทีม (get_case_tracking → teamLocation / scene)
-- เฉพาะ EN_ROUTE / ON_SITE, เฉพาะคนที่รับเคสคนปัจจุบัน, ไม่มีข้อมูลส่วนตัวกู้ภัย, ตำแหน่งเก่าเกิน 2 นาที = null,
-- เคสอื่นอ่านไม่ได้, เคสรอส่งต่อไม่เผยหน่วยปลายทาง, ส่งต่อสำเร็จแล้วไม่หยิบตำแหน่งกู้ภัยหน่วยเดิม (TF-59)
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(29);

-- ผู้ใช้: 1 A กู้ภัย U1 (น่าน) / 2 B กู้ภัย U2 (แพร่ มีเรือ) / 3 ผู้แจ้ง
insert into auth.users(id)
  select ('a4200000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 3) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id, phone)
  select ('b4200000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a4200000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'TF42ชื่อจริง-' || g,
         (case g when 3 then 'USER' else 'RESCUER' end)::public.user_role,
         'ACTIVE',
         'U' || lpad(to_hex(4200 + g), 32, '0'),
         '08142000' || lpad(g::text, 2, '0')
  from generate_series(1, 3) g;
insert into public.units(id, name, province, contact_phone) values
  ('c4200000-0000-0000-0000-000000000001', 'TF42 หน่วยเดิม', 'น่าน', '021111111'),
  ('c4200000-0000-0000-0000-000000000002', 'TF42 หน่วยเรือปลายทาง', 'แพร่', '022222222');
insert into public.unit_capabilities(unit_id, capability)
  values ('c4200000-0000-0000-0000-000000000002', 'BOAT');
insert into public.unit_members(unit_id, user_id, role_in_unit, status) values
  ('c4200000-0000-0000-0000-000000000001', 'b4200000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED'),
  ('c4200000-0000-0000-0000-000000000002', 'b4200000-0000-0000-0000-000000000002', 'MEMBER', 'APPROVED');

create function pg_temp.new_case(code text, demo boolean default false) returns uuid
language sql as $$
  insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, incident_type,
                           reporter_user_id, is_demo, assigned_unit_id)
  values (code, 'YELLOW', 'NEW', 18.78, 100.78, 'หน้าวัด', 'น่าน', 'FLOOD',
          'b4200000-0000-0000-0000-000000000003', demo,
          case when demo then 'd5610000-0000-4000-8000-000000000010'::uuid end)
  returning id
$$;
create function pg_temp.id(code text) returns uuid language sql as
  $$ select id from public.cases where case_code = code $$;
create function pg_temp.ver(code text) returns integer language sql as
  $$ select version from public.cases where case_code = code $$;
create function pg_temp.track(code text) returns jsonb language sql as
  $$ select public.get_case_tracking(code, null, (select tracking_token from public.cases where case_code = code)) $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a4200000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
-- ตำแหน่งกู้ภัยคนที่ n (ห่างจากเคสไปทางเหนือ north_m เมตร)
create function pg_temp.share(n int, north_m double precision, age interval default '0 seconds') returns void
language sql as $$
  insert into public.rescuer_locations as r (user_id, location, lat, lng, is_sharing, recorded_at)
  values (('b4200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
    st_setsrid(st_makepoint(100.78, 18.78 + north_m / 111320.0), 4326)::geography,
    18.78 + north_m / 111320.0, 100.78, true, now() - age)
  on conflict (user_id) do update
    set location = excluded.location, lat = excluded.lat, lng = excluded.lng,
        is_sharing = true, recorded_at = excluded.recorded_at
$$;
create function pg_temp.step(code text, to_status text) returns void language sql as
  $$ update public.cases set status = to_status::public.case_status where case_code = code $$;
grant execute on function pg_temp.id(text), pg_temp.ver(text), pg_temp.as_user(int) to authenticated;

select pg_temp.new_case('TF42-C1');
select pg_temp.new_case('TF42-C2');
select pg_temp.new_case('TF42-DEMO', true);
select pg_temp.share(1, 2000);

-- ---------- 1. รอทีม / รับแล้ว: ยังไม่มีตำแหน่งและพิกัดเคส ----------
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb
  and pg_temp.track('TF42-C1') -> 'scene' = 'null'::jsonb, 'NEW: ไม่มีตำแหน่งทีมและพิกัดเคส');
set local role authenticated;
select pg_temp.as_user(1);
select public.accept_case(pg_temp.id('TF42-C1'), pg_temp.ver('TF42-C1'));
reset role;
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb,
  'ACCEPTED: ทีมแชร์อยู่ก็ยังไม่ส่งตำแหน่ง (ยังไม่ออกเดินทาง)');
select ok(pg_temp.track('TF42-C1') -> 'scene' = 'null'::jsonb, 'ACCEPTED: ยังไม่ส่งพิกัดเคส');

-- ---------- 2. กำลังมา: ตำแหน่งของคนที่รับเคส ----------
select pg_temp.step('TF42-C1', 'EN_ROUTE');
select is((pg_temp.track('TF42-C1') -> 'teamLocation' ->> 'lat')::numeric(9, 5), (18.78 + 2000 / 111320.0)::numeric(9, 5),
  'EN_ROUTE: ได้ตำแหน่งล่าสุดของคนที่รับเคส');
select ok((pg_temp.track('TF42-C1') -> 'teamLocation' ->> 'distanceM')::int between 1950 and 2050,
  'ระยะทางคำนวณด้วย PostGIS (ประมาณ 2 กม.)');
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' ? 'updatedAt', 'มีเวลาที่ทีมอัปเดตตำแหน่ง');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.track('TF42-C1') -> 'teamLocation') k),
  array['distanceM', 'lat', 'lng', 'updatedAt'], 'teamLocation มีแค่ พิกัด เวลา ระยะ');
select is(pg_temp.track('TF42-C1') -> 'scene', jsonb_build_object('lat', 18.78, 'lng', 100.78),
  'EN_ROUTE: ส่งพิกัดเคสให้ปักหมุดผู้แจ้ง');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.track('TF42-C1') -> 'team') k),
  array['contactPhone', 'unitName'], 'ข้อมูลทีมมีแค่ชื่อหน่วยและเบอร์หน่วย');
select is(pg_temp.track('TF42-C1') -> 'team' ->> 'contactPhone', '021111111', 'ปุ่มโทรใช้เบอร์หน่วย');
select ok(position('b4200000-0000-0000-0000-000000000001' in pg_temp.track('TF42-C1')::text) = 0
  and position('a4200000-0000-0000-0000-000000000001' in pg_temp.track('TF42-C1')::text) = 0,
  'ไม่มี user id ของกู้ภัย');
select ok(position('TF42ชื่อจริง-1' in pg_temp.track('TF42-C1')::text) = 0, 'ไม่มีชื่อจริงของกู้ภัย');
select ok(position('0814200001' in pg_temp.track('TF42-C1')::text) = 0
  and position(lpad(to_hex(4201), 32, '0') in pg_temp.track('TF42-C1')::text) = 0,
  'ไม่มีเบอร์ส่วนตัว/LINE ของกู้ภัย');

-- ---------- 3. ถึงแล้ว ----------
select pg_temp.step('TF42-C1', 'ON_SITE');
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' <> 'null'::jsonb, 'ON_SITE: ยังเห็นตำแหน่งทีม');

-- ---------- 4. ตำแหน่งเก่า / หยุดแชร์ / ไม่มีแถว ----------
select pg_temp.share(1, 2000, '3 minutes');
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb,
  'อัปเดตล่าสุดเกิน 2 นาที: ไม่คืนตำแหน่งเก่า');
select pg_temp.share(1, 2000, '90 seconds');
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' <> 'null'::jsonb, 'ไม่เกิน 2 นาที: ยังคืน');
update public.rescuer_locations set is_sharing = false where user_id = 'b4200000-0000-0000-0000-000000000001';
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb, 'หยุดแชร์: null');
delete from public.rescuer_locations where user_id = 'b4200000-0000-0000-0000-000000000001';
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb, 'ไม่มีแถวใน rescuer_locations: null');
select pg_temp.share(1, 2000);

-- ---------- 5. สถานะอื่น / เคสอื่น / เคสตัวอย่าง ----------
select pg_temp.step('TF42-C1', 'AWAITING_CONFIRMATION');
select ok(pg_temp.track('TF42-C1') -> 'teamLocation' = 'null'::jsonb
  and pg_temp.track('TF42-C1') -> 'scene' = 'null'::jsonb, 'AWAITING_CONFIRMATION: ไม่มีตำแหน่งและพิกัด');
select is(public.get_case_tracking('TF42-C2', null, (select tracking_token from public.cases where case_code = 'TF42-C1')),
  null, 'token ของเคสหนึ่งเปิดอีกเคสไม่ได้');
select pg_temp.step('TF42-DEMO', 'ACCEPTED');
update public.cases set assigned_rescuer_id = 'b4200000-0000-0000-0000-000000000001' where case_code = 'TF42-DEMO';
select pg_temp.step('TF42-DEMO', 'EN_ROUTE');
select ok(pg_temp.track('TF42-DEMO') -> 'teamLocation' = 'null'::jsonb
  and pg_temp.track('TF42-DEMO') -> 'scene' = 'null'::jsonb, 'เคสตัวอย่าง (TF-70): ไม่มีแผนที่');

-- ---------- 6. ส่งต่อ (TF-59) ----------
set local role authenticated;
select pg_temp.as_user(1);
select public.accept_case(pg_temp.id('TF42-C2'), pg_temp.ver('TF42-C2'));
reset role;
select pg_temp.step('TF42-C2', 'EN_ROUTE');
set local role authenticated;
select pg_temp.as_user(1);
select is(public.request_transfer(pg_temp.id('TF42-C2'), pg_temp.ver('TF42-C2'),
  'c4200000-0000-0000-0000-000000000002', array['BOAT'], 'น้ำสูง ต้องใช้เรือ') ->> 'status', 'REQUESTED',
  'หน่วยเดิมขอส่งต่อ');
reset role;
select ok(pg_temp.track('TF42-C2') ->> 'transferPending' = 'true', 'รอส่งต่อ: หน้าติดตามรู้ว่ากำลังส่งต่อ');
select ok(position('หน่วยเรือปลายทาง' in pg_temp.track('TF42-C2')::text) = 0,
  'รอส่งต่อ: ไม่เผยชื่อหน่วยปลายทาง');
select is(pg_temp.track('TF42-C2') -> 'team' ->> 'unitName', 'TF42 หน่วยเดิม',
  'รอส่งต่อ: หน่วยเดิมยังดูแลอยู่');
select ok(pg_temp.track('TF42-C2') -> 'teamLocation' <> 'null'::jsonb,
  'รอส่งต่อ: ตำแหน่งของคนที่ยังถือเคส (หน่วยเดิม)');

set local role authenticated;
select pg_temp.as_user(2);
select is(public.accept_transfer(
  (select t.id from public.case_transfers t where t.case_id = pg_temp.id('TF42-C2') and t.status = 'pending'),
  pg_temp.ver('TF42-C2')) ->> 'status', 'ACCEPTED', 'หน่วยปลายทางกดรับ');
reset role;
select pg_temp.step('TF42-C2', 'EN_ROUTE');
-- กู้ภัยหน่วยเดิม (A) ยังแชร์อยู่ใกล้เคส แต่ไม่ใช่คนที่รับเคสแล้ว
select pg_temp.share(1, 100);
select ok(pg_temp.track('TF42-C2') -> 'teamLocation' = 'null'::jsonb,
  'ส่งต่อสำเร็จ คนรับใหม่ยังไม่แชร์: null (ไม่หยิบตำแหน่งกู้ภัยหน่วยเดิม)');
select pg_temp.share(2, 5000);
select ok((pg_temp.track('TF42-C2') -> 'teamLocation' ->> 'distanceM')::int between 4900 and 5100,
  'ส่งต่อสำเร็จ: ตำแหน่งของคนที่รับเคสคนปัจจุบันเท่านั้น');

select * from finish();
rollback;
