-- ============================================================================
-- TF-28: แชร์ตำแหน่งกู้ภัย
-- 1 แถวต่อคน (ไม่มีประวัติ), เขียนผ่าน RPC เท่านั้น, ใครเห็น (จังหวัดเดียวกัน/แอดมิน/ไม่ใช่ผู้แจ้ง),
-- เกิน 15 นาทีไม่เห็น, หยุดแล้วไม่มีแถวค้าง, cron ลบแถวเกิน 1 ชม.,
-- ถึงที่เกิดเหตุเก็บระยะ/location_unavailable, ด่าน FAR_FROM_SCENE, LINE เคสแดงรัศมี 5 กม.
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

-- ผู้ใช้: 1 A กู้ภัยน่าน / 2 B กู้ภัยน่าน / 3 C กู้ภัยแพร่ / 4 แอดมิน / 5 ผู้ใช้ทั่วไป / 6 D กู้ภัยน่าน (ไม่แชร์)
--        7 E กู้ภัยแพร่ (แชร์อยู่ใกล้เคสในน่าน)
insert into auth.users(id)
  select ('a2800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 7) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b2800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a2800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf28-' || g,
         (case g when 4 then 'ADMIN' when 5 then 'USER' else 'RESCUER' end)::public.user_role,
         'ACTIVE', 'U' || lpad(to_hex(2800 + g), 32, '0')
  from generate_series(1, 7) g;
insert into public.units(id, name, province) values
  ('c2800000-0000-0000-0000-000000000001', 'TF28 หน่วยน่าน', 'น่าน'),
  ('c2800000-0000-0000-0000-000000000002', 'TF28 หน่วยแพร่', 'แพร่');
insert into public.unit_members(unit_id, user_id, role_in_unit, status, is_on_duty, duty_status)
  select ('c2800000-0000-0000-0000-00000000000' || u)::uuid,
         ('b2800000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'MEMBER', 'APPROVED', true, 'AVAILABLE'
  from (values (1, 1), (2, 1), (3, 2), (6, 1), (7, 2)) x(g, u);

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a2800000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('b2800000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
grant execute on function pg_temp.uid(int) to authenticated;

-- จุดอ้างอิง: เมืองน่าน 18.7756, 100.7730 (0.018° ≈ 2 กม. ตามแนวเหนือ-ใต้)

-- ---------- 1. เขียนผ่าน RPC เท่านั้น 1 แถวต่อคน ----------
set local role authenticated;
select pg_temp.as_user(1);
select is(public.share_my_location(18.7756, 100.7730, 30) ->> 'status', 'SAVED', 'กู้ภัยแชร์ตำแหน่งได้');
select is(public.share_my_location(18.7757, 100.7731, 25) ->> 'status', 'TOO_SOON',
  'ส่งซ้ำภายใน 10 วินาทีไม่บันทึก');
select is((select count(*)::int from public.rescuer_locations where user_id = pg_temp.uid(1)), 1,
  'เก็บแค่ตำแหน่งล่าสุด 1 แถวต่อคน');
select is((select province from public.rescuer_locations where user_id = pg_temp.uid(1)), 'น่าน',
  'จังหวัดคำนวณจากพิกัดที่เซิร์ฟเวอร์');
select ok((select heading is null and speed_mps is null from public.rescuer_locations where user_id = pg_temp.uid(1)),
  'ไม่เก็บทิศทาง/ความเร็ว');
select throws_ok($$select public.share_my_location(18.7756, 100.7730, 1500)$$, '22023', null,
  'คลาดเกิน 1,000 ม. ไม่รับ');
select throws_ok($$insert into public.rescuer_locations(user_id, location, lat, lng)
  values (pg_temp.uid(1), 'SRID=4326;POINT(100.77 18.77)', 18.77, 100.77)$$, '42501', null,
  'เขียนตารางตรงไม่ได้');
select throws_ok($$delete from public.rescuer_locations$$, '42501', null, 'ลบตารางตรงไม่ได้');
select pg_temp.as_user(5);
select throws_ok($$select public.share_my_location(18.7756, 100.7730, 30)$$, '42501', null,
  'ผู้ใช้ที่ไม่มีหน่วยแชร์ตำแหน่งไม่ได้');

-- ---------- 2. ใครเห็น ----------
select pg_temp.as_user(2);
select is((select count(*)::int from public.rescuer_locations where user_id = pg_temp.uid(1)), 1,
  'กู้ภัยจังหวัดเดียวกันเห็น (RLS)');
select ok(exists (select 1 from public.list_team_locations() where user_id = pg_temp.uid(1)),
  'กู้ภัยจังหวัดเดียวกันเห็นหมุดทีม');
select pg_temp.as_user(3);
select is((select count(*)::int from public.rescuer_locations where user_id = pg_temp.uid(1)), 0,
  'กู้ภัยต่างจังหวัดไม่เห็น (RLS)');
select is((select count(*)::int from public.list_team_locations()), 0, 'กู้ภัยต่างจังหวัดไม่เห็นหมุดทีม');
select pg_temp.as_user(5);
select is((select count(*)::int from public.rescuer_locations), 0, 'ผู้ใช้ทั่วไป/ผู้แจ้งไม่เห็น');
select pg_temp.as_user(4);
select ok(exists (select 1 from public.list_team_locations() where user_id = pg_temp.uid(1)),
  'แอดมินเห็นทุกจังหวัด');
select pg_temp.as_user(1);
select ok(not exists (select 1 from public.list_team_locations() where user_id = pg_temp.uid(1)),
  'หมุดทีมไม่รวมตัวเอง');
reset role;
update public.rescuer_locations set recorded_at = now() - interval '16 minutes' where user_id = pg_temp.uid(1);
set local role authenticated;
select pg_temp.as_user(2);
select is((select count(*)::int from public.rescuer_locations where user_id = pg_temp.uid(1)), 0,
  'ไม่อัปเดตเกิน 15 นาที กู้ภัยคนอื่นไม่เห็นแล้ว');

-- ---------- 3. หยุดแชร์ = ไม่มีแถวค้าง ----------
select pg_temp.as_user(1);
select lives_ok($$select public.stop_sharing_location()$$, 'หยุดแชร์ได้');
reset role;
select is((select count(*)::int from public.rescuer_locations where user_id = pg_temp.uid(1)), 0,
  'หยุดแชร์แล้วไม่มีแถวค้าง (ไม่เก็บพิกัดสุดท้าย)');
-- cron: แถวที่ไม่อัปเดตเกิน 1 ชม. ถูกลบ แถวที่ยังสดอยู่ไม่ถูกลบ
insert into public.rescuer_locations(user_id, unit_id, location, lat, lng, accuracy_m, province, recorded_at) values
  (pg_temp.uid(2), 'c2800000-0000-0000-0000-000000000001', 'SRID=4326;POINT(100.77 18.77)', 18.77, 100.77, 20, 'น่าน',
   now() - interval '2 hours'),
  (pg_temp.uid(6), 'c2800000-0000-0000-0000-000000000001', 'SRID=4326;POINT(100.77 18.77)', 18.77, 100.77, 20, 'น่าน',
   now() - interval '10 minutes');
select is(rls.purge_stale_rescuer_locations(), 1, 'cron ลบแถวที่ไม่อัปเดตเกิน 1 ชม.');
select is((select array_agg(user_id) from public.rescuer_locations where user_id in (pg_temp.uid(2), pg_temp.uid(6))),
  array[pg_temp.uid(6)], 'แถวที่ยังสดอยู่ไม่ถูกลบ');
delete from public.rescuer_locations where user_id = pg_temp.uid(6);
select ok(exists (select 1 from cron.job where jobname = 'tf28-rescuer-location-cleanup'), 'ตั้ง pg_cron แล้ว');
select ok(exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'rescuer_locations'), 'อยู่ในช่อง Realtime เดิม');

-- ---------- 4. ถึงที่เกิดเหตุ: ระยะ / location_unavailable และด่าน FAR_FROM_SCENE ----------
insert into public.cases(id, case_code, urgency, lat, lng, landmark, province, incident_type) values
  ('d2800000-0000-0000-0000-000000000001', 'TF28-FAR', 'YELLOW', 18.7756, 100.7730, 'จุด 1', 'น่าน', 'FLOOD'),
  ('d2800000-0000-0000-0000-000000000002', 'TF28-NOLOC', 'YELLOW', 18.7756, 100.7730, 'จุด 2', 'น่าน', 'FLOOD');
update public.cases set status = 'ACCEPTED', assigned_unit_id = 'c2800000-0000-0000-0000-000000000001',
  assigned_rescuer_id = pg_temp.uid(1), accepted_at = now() - interval '1 hour'
  where id = 'd2800000-0000-0000-0000-000000000001';
update public.cases set status = 'ACCEPTED', assigned_unit_id = 'c2800000-0000-0000-0000-000000000001',
  assigned_rescuer_id = pg_temp.uid(2), accepted_at = now()
  where id = 'd2800000-0000-0000-0000-000000000002';

create function pg_temp.step(p_case uuid, p_to public.case_status) returns jsonb language sql as $$
  select public.advance_case_status(p_case, (select version from public.cases where id = p_case), p_to,
    null, case when p_to = 'AWAITING_CONFIRMATION' then 'HELPED' end,
    case when p_to = 'AWAITING_CONFIRMATION' then 1 end);
$$;
grant execute on function pg_temp.step(uuid, public.case_status) to authenticated;

set local role authenticated;
select pg_temp.as_user(1);
select public.share_my_location(18.7936, 100.7730, 20); -- ห่างจากเคส ~2 กม.
select pg_temp.step('d2800000-0000-0000-0000-000000000001', 'EN_ROUTE');
select pg_temp.step('d2800000-0000-0000-0000-000000000001', 'ON_SITE');
select pg_temp.step('d2800000-0000-0000-0000-000000000001', 'AWAITING_CONFIRMATION');
select pg_temp.as_user(2);
select pg_temp.step('d2800000-0000-0000-0000-000000000002', 'EN_ROUTE');
select pg_temp.step('d2800000-0000-0000-0000-000000000002', 'ON_SITE');
select pg_temp.step('d2800000-0000-0000-0000-000000000002', 'AWAITING_CONFIRMATION');
reset role;

select ok((select (metadata ->> 'distanceToSceneM')::int between 1900 and 2100 from public.case_events
  where case_id = 'd2800000-0000-0000-0000-000000000001' and to_status = 'ON_SITE'),
  'ถึงที่เกิดเหตุบันทึกระยะห่างจากเคสเป็นเมตร');
select ok((select not (metadata ?| array['lat', 'lng', 'location']) from public.case_events
  where case_id = 'd2800000-0000-0000-0000-000000000001' and to_status = 'ON_SITE'),
  'ไม่เก็บพิกัดกู้ภัยลง case_events');
select is((select metadata ->> 'sceneLocation' from public.case_events
  where case_id = 'd2800000-0000-0000-0000-000000000002' and to_status = 'ON_SITE'), 'location_unavailable',
  'ไม่มีตำแหน่ง บันทึก location_unavailable');

select set_config('app.case_close_by_lead', 'on', true);
update public.cases set status = 'RESOLVED', close_confirmation = 'REPORTER_CONFIRMED', resolved_at = now(),
  closed_at = now() where id in ('d2800000-0000-0000-0000-000000000001', 'd2800000-0000-0000-0000-000000000002');
select set_config('app.case_close_by_lead', '', true);

select is((select reasons from public.case_performance_reviews where case_id = 'd2800000-0000-0000-0000-000000000001'),
  array['FAR_FROM_SCENE'], 'ห่างเกิน 1 กม. ติดด่าน FAR_FROM_SCENE');
select ok((select not ('FAR_FROM_SCENE' = any(reasons)) from public.case_performance_reviews
  where case_id = 'd2800000-0000-0000-0000-000000000002'),
  'ไม่มีตำแหน่ง ไม่ติดด่าน FAR_FROM_SCENE (ติดแค่เร็วผิดปกติ)');
set local role authenticated;
select pg_temp.as_user(4);
select is((select notes from public.pending_performance_reviews() where case_code = 'TF28-NOLOC'),
  array['LOCATION_UNAVAILABLE'], 'คิวตรวจแสดง "ไม่มีข้อมูลตำแหน่ง" เป็นข้อมูลประกอบ');
select is((select notes from public.pending_performance_reviews() where case_code = 'TF28-FAR'),
  '{}'::text[], 'เคสที่มีตำแหน่งไม่มีข้อมูลประกอบ');

-- ---------- 5. LINE เคสแดง: แชร์อยู่ = รัศมี 5 กม. · ไม่แชร์ = จังหวัด ----------
select pg_temp.as_user(1);
select public.stop_sharing_location();
reset role;
-- A แชร์อยู่ห่างเคส ~6 กม. (จังหวัดเดียวกัน) · E หน่วยแพร่แต่แชร์อยู่ห่างเคส ~3 กม. · D ไม่แชร์ (หน่วยน่าน)
insert into public.rescuer_locations(user_id, unit_id, location, lat, lng, accuracy_m, province) values
  (pg_temp.uid(1), 'c2800000-0000-0000-0000-000000000001', 'SRID=4326;POINT(100.7730 18.8296)', 18.8296, 100.7730, 20, 'น่าน'),
  (pg_temp.uid(7), 'c2800000-0000-0000-0000-000000000002', 'SRID=4326;POINT(100.7730 18.8026)', 18.8026, 100.7730, 20, 'น่าน');
insert into public.cases(id, case_code, urgency, lat, lng, landmark, province, incident_type) values
  ('d2800000-0000-0000-0000-000000000003', 'TF28-RED', 'RED', 18.7756, 100.7730, 'จุด 3', 'น่าน', 'FLOOD');
select ok(not exists (select 1 from public.list_red_alert_candidates('d2800000-0000-0000-0000-000000000003')
  where user_id = pg_temp.uid(1)), 'แชร์ตำแหน่งอยู่นอกรัศมี 5 กม. ไม่ได้แจ้ง แม้จังหวัดเดียวกัน');
select ok(exists (select 1 from public.list_red_alert_candidates('d2800000-0000-0000-0000-000000000003')
  where user_id = pg_temp.uid(7)), 'แชร์ตำแหน่งอยู่ในรัศมี 5 กม. ได้แจ้ง แม้หน่วยอยู่ต่างจังหวัด');
select ok(exists (select 1 from public.list_red_alert_candidates('d2800000-0000-0000-0000-000000000003')
  where user_id = pg_temp.uid(6)), 'ไม่แชร์ตำแหน่ง ใช้จังหวัดของหน่วยเหมือนเดิม');

select * from finish();
rollback;
