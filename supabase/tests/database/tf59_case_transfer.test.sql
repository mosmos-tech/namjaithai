-- ============================================================================
-- TF-59: ส่งต่อเคสให้หน่วยอื่น — ใครส่ง/รับ/ยกเลิกได้, หน่วยที่แนะนำ (ความสามารถตรง ไม่ใช่หน่วยตัวอย่าง เรียงระยะ),
-- ส่งต่อซ้อนไม่ได้, ระหว่างรอหน่วยเดิมยังถือเคส, กดรับย้ายเคส (version), ยกเลิกอัตโนมัติ, หมดเวลา 15 นาที
-- (กลับเป็น NEW + แท็ก + LINE หัวหน้า + เคสแดงแจ้งหน่วยที่มีความสามารถ), หน้าติดตาม, TF-57 นับ "ส่งต่อ"
-- รัน: npx supabase test db
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(64);

-- ผู้ใช้: 1 A กู้ภัย U1 (ถือเคส) / 2 L หัวหน้า U1 / 3 M สมาชิก U1 / 4 B กู้ภัย U2 (ปลายทาง แพร่)
--        5 BL หัวหน้า U2 / 6 C กู้ภัย U3 (แพร่ ไม่มีพิกัด) / 7 แอดมิน / 8 ผู้แจ้ง / 9 D กู้ภัย U4 (ไม่มีเรือ)
--        10 E กู้ภัย U5 (หน่วยตัวอย่าง มีเรือ)
insert into auth.users(id)
  select ('a5900000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 10) g;
insert into public.users(id, auth_user_id, display_name, role, status, line_user_id)
  select ('b5900000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         ('a5900000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         'tf59-' || g,
         (case g when 2 then 'UNIT_LEAD' when 5 then 'UNIT_LEAD' when 7 then 'ADMIN' when 8 then 'USER'
            else 'RESCUER' end)::public.user_role,
         'ACTIVE',
         'U' || lpad(to_hex(5900 + g), 32, '0')
  from generate_series(1, 10) g;

-- U1 น่าน (ไม่มีเรือ) · U2 แพร่ มีเรือ ตั้งพิกัดใกล้เคส · U3 แพร่ มีเรือ+แพทย์ ไม่มีพิกัด (ใช้จุดกลางจังหวัด)
-- U4 น่าน แพทย์อย่างเดียว · U5 หน่วยตัวอย่าง มีเรือ · U6 น่าน มีเรือแต่ไม่มีสมาชิก
insert into public.units(id, name, province, source, lead_user_id, location) values
  ('c5900000-0000-0000-0000-000000000001', 'TF59 หน่วยหนึ่ง', 'น่าน', 'ADMIN', 'b5900000-0000-0000-0000-000000000002', null),
  ('c5900000-0000-0000-0000-000000000002', 'TF59 หน่วยเรือใกล้', 'แพร่', 'ADMIN', 'b5900000-0000-0000-0000-000000000005',
    st_setsrid(st_makepoint(100.80, 18.80), 4326)::geography),
  ('c5900000-0000-0000-0000-000000000003', 'TF59 หน่วยเรือไกล', 'แพร่', 'ADMIN', null, null),
  ('c5900000-0000-0000-0000-000000000004', 'TF59 หน่วยแพทย์', 'น่าน', 'ADMIN', null, null),
  ('c5900000-0000-0000-0000-000000000005', 'TF59 หน่วยตัวอย่าง', 'น่าน', 'DEMO', null, null),
  ('c5900000-0000-0000-0000-000000000006', 'TF59 หน่วยไม่มีคน', 'น่าน', 'ADMIN', null, null);
insert into public.unit_capabilities(unit_id, capability) values
  ('c5900000-0000-0000-0000-000000000002', 'BOAT'),
  ('c5900000-0000-0000-0000-000000000003', 'BOAT'),
  ('c5900000-0000-0000-0000-000000000003', 'EMS'),
  ('c5900000-0000-0000-0000-000000000004', 'EMS'),
  ('c5900000-0000-0000-0000-000000000005', 'BOAT'),
  ('c5900000-0000-0000-0000-000000000006', 'BOAT');
insert into public.unit_members(unit_id, user_id, role_in_unit, status, is_on_duty, duty_status) values
  ('c5900000-0000-0000-0000-000000000001', 'b5900000-0000-0000-0000-000000000001', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000001', 'b5900000-0000-0000-0000-000000000002', 'LEAD', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000001', 'b5900000-0000-0000-0000-000000000003', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000002', 'b5900000-0000-0000-0000-000000000004', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000002', 'b5900000-0000-0000-0000-000000000005', 'LEAD', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000003', 'b5900000-0000-0000-0000-000000000006', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000004', 'b5900000-0000-0000-0000-000000000009', 'MEMBER', 'APPROVED', true, 'AVAILABLE'),
  ('c5900000-0000-0000-0000-000000000005', 'b5900000-0000-0000-0000-000000000010', 'MEMBER', 'APPROVED', true, 'AVAILABLE');

create function pg_temp.new_case(code text, urgency text) returns uuid
language sql as $$
  insert into public.cases(case_code, urgency, status, lat, lng, landmark, province, incident_type, reporter_user_id)
  values (code, urgency::public.urgency_level, 'NEW', 18.78, 100.78, 'หน้าวัด', 'น่าน', 'FLOOD',
          'b5900000-0000-0000-0000-000000000008')
  returning id
$$;
create function pg_temp.id(code text) returns uuid language sql as
  $$ select id from public.cases where case_code = code $$;
create function pg_temp.ver(code text) returns integer language sql as
  $$ select version from public.cases where case_code = code $$;
create function pg_temp.pending(code text) returns uuid language sql as
  $$ select t.id from public.case_transfers t where t.case_id = pg_temp.id(code) and t.status = 'pending' $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a5900000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text,
    true);
$$;

select pg_temp.new_case('TF59-C1', 'YELLOW');
select pg_temp.new_case('TF59-C2', 'YELLOW');
select pg_temp.new_case('TF59-C3', 'YELLOW');
select pg_temp.new_case('TF59-C4', 'RED');
insert into public.case_contacts(case_id, name, phone, phone_last4)
  values (pg_temp.id('TF59-C1'), 'ผู้แจ้ง TF59', '0815905900', '5900');

grant execute on function pg_temp.id(text), pg_temp.ver(text), pg_temp.pending(text), pg_temp.as_user(int)
  to authenticated;

-- A รับเคส C1–C3 (ทีละ 2 เคสตามเพดาน: C3 รับทีหลังตอนส่งต่อ C1 ออกไปแล้ว)
set local role authenticated;
select pg_temp.as_user(1);
select public.accept_case(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'));
select public.accept_case(pg_temp.id('TF59-C2'), pg_temp.ver('TF59-C2'));
reset role;

-- ---------- 1. หน่วยที่แนะนำ ----------
set local role authenticated;
select pg_temp.as_user(1);
select is(
  (select array_agg(unit_name order by ord) from (
     select unit_name, row_number() over () as ord
     from public.case_transfer_options(pg_temp.id('TF59-C1'), array['BOAT'])) o),
  array['TF59 หน่วยเรือใกล้', 'TF59 หน่วยเรือไกล'],
  'แนะนำเฉพาะหน่วยที่มีเรือ เปิดใช้งาน มีสมาชิก ไม่ใช่หน่วยตัวอย่าง/หน่วยตัวเอง เรียงใกล้ไปไกล');
select is(
  (select array_agg(is_approximate order by distance_m)
   from public.case_transfer_options(pg_temp.id('TF59-C1'), array['BOAT'])),
  array[false, true],
  'หน่วยที่ตั้งพิกัดเป็นระยะจริง หน่วยที่ไม่มีพิกัดเป็นระยะโดยประมาณ (จุดกลางอำเภอ/จังหวัด)');
select ok(
  (select distance_m < 5000 from public.case_transfer_options(pg_temp.id('TF59-C1'), array['BOAT'])
   where unit_name = 'TF59 หน่วยเรือใกล้'),
  'ระยะวัดจากพิกัดหน่วยถึงเคส');
select is(
  (select array_agg(unit_name) from public.case_transfer_options(pg_temp.id('TF59-C1'), array['BOAT', 'EMS'])),
  array['TF59 หน่วยเรือไกล'],
  'ขาดหลายอย่าง: หน่วยต้องมีครบทุกอย่าง');
select throws_ok($$select * from public.case_transfer_options(pg_temp.id('TF59-C1'), array['TANK'])$$,
  '22023', null, 'ความสามารถที่ไม่มีในรายการ: ไม่ผ่าน');
select pg_temp.as_user(4);
select throws_ok($$select * from public.case_transfer_options(pg_temp.id('TF59-C1'), array['BOAT'])$$,
  '42501', null, 'คนนอกหน่วยที่รับเคส ดูรายชื่อแนะนำไม่ได้');
reset role;

-- ---------- 2. ใครขอส่งต่อได้ ----------
set local role authenticated;
select pg_temp.as_user(3);
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '42501', null, 'สมาชิกหน่วยเดียวกันที่ไม่ได้รับเคส ส่งต่อไม่ได้');
select pg_temp.as_user(7);
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '42501', null, 'แอดมินไม่รับเคสเอง จึงไม่ส่งต่อ (ใช้มอบหมายแทน)');
select pg_temp.as_user(8);
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '42501', null, 'ผู้แจ้งส่งต่อไม่ได้');
select pg_temp.as_user(4);
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '42501', null, 'หน่วยอื่นที่มองไม่เห็นเคส ส่งต่อไม่ได้');
select pg_temp.as_user(1);
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'สั้น')$$,
  '22023', null, 'เหตุผลสั้นกว่า 5 ตัวอักษร: ไม่ผ่าน');
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array[]::text[], 'ไม่มีเรือ น้ำสูง')$$,
  '22023', null, 'ไม่เลือกความสามารถที่ขาด: ไม่ผ่าน');
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000004', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '22023', null, 'ส่งให้หน่วยที่ไม่มีความสามารถนั้นไม่ได้');
select throws_ok($$select public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000005', array['BOAT'], 'ไม่มีเรือ น้ำสูง')$$,
  '22023', null, 'ส่งให้หน่วยตัวอย่าง (TF-70) ไม่ได้');
select is(public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1') - 1,
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง') ->> 'status', 'STALE',
  'version เก่า: ให้โหลดเคสใหม่');
reset role;

-- B (แพร่) ยังมองไม่เห็นเคสที่น่าน
set local role authenticated;
select pg_temp.as_user(4);
select is((select count(*)::int from public.cases where case_code = 'TF59-C1'), 0,
  'ก่อนส่งต่อ หน่วยต่างจังหวัดมองไม่เห็นเคส');
select pg_temp.as_user(1);
select is(public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง') ->> 'status', 'REQUESTED',
  'คนที่รับเคสขอส่งต่อได้');
select pg_temp.as_user(2);
select is(public.request_transfer(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'),
  'c5900000-0000-0000-0000-000000000003', array['BOAT'], 'ขอส่งอีกหน่วย') ->> 'status', 'ALREADY_PENDING',
  'ส่งต่อซ้อนไม่ได้: pending ได้ทีละ 1 คำขอต่อเคส');
reset role;

select throws_ok($$insert into public.case_transfers(case_id, from_unit_id, to_unit_id, missing_capabilities, reason)
  values (pg_temp.id('TF59-C1'), 'c5900000-0000-0000-0000-000000000001', 'c5900000-0000-0000-0000-000000000003',
    array['BOAT'], 'แทรกตรงในฐานข้อมูล')$$,
  '23505', null, 'ฐานข้อมูลกันคำขอ pending ที่สองด้วย unique index');
select ok((select status = 'ACCEPTED' and assigned_unit_id = 'c5900000-0000-0000-0000-000000000001'
    and assigned_rescuer_id = 'b5900000-0000-0000-0000-000000000001'
  from public.cases where case_code = 'TF59-C1'),
  'ระหว่างรอ หน่วยเดิมยังเป็นผู้รับผิดชอบ (หน่วยเดียว)');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF59-C1')
  and event_type = 'TRANSFER_REQUESTED' and metadata -> 'missingCapabilities' = '["BOAT"]'), 1,
  'case_events บันทึกคำขอส่งต่อพร้อมความสามารถที่ขาด');
select is((select count(*)::int from public.audit_logs where case_id = pg_temp.id('TF59-C1')
  and action = 'CASE_TRANSFER_REQUESTED'), 1, 'audit_logs บันทึกคำขอส่งต่อ');

set local role authenticated;
select pg_temp.as_user(1);
select throws_ok($$insert into public.case_transfers(case_id, from_unit_id, to_unit_id, missing_capabilities, reason)
  values (pg_temp.id('TF59-C1'), 'c5900000-0000-0000-0000-000000000001', 'c5900000-0000-0000-0000-000000000003',
    array['BOAT'], 'แทรกตรงจากเว็บ')$$,
  '42501', null, 'เขียนตาราง case_transfers ตรงไม่ได้ ต้องผ่าน RPC');

-- ระหว่างรอ หน่วยเดิมอัปเดตเคสได้ตามปกติ
select is(public.advance_case_status(pg_temp.id('TF59-C1'), pg_temp.ver('TF59-C1'), 'EN_ROUTE') ->> 'status',
  'UPDATED', 'ระหว่างรอ หน่วยเดิมเลื่อนสถานะได้ตามปกติ');

-- ---------- 3. หน่วยปลายทางเห็นเคส (ไม่เห็นข้อมูลติดต่อ) ----------
select pg_temp.as_user(4);
select is((select count(*)::int from public.cases where case_code = 'TF59-C1'), 1,
  'หน่วยปลายทางเห็นเคสที่รอรับส่งต่อ');
select is((select count(*)::int from public.case_contacts where case_id = pg_temp.id('TF59-C1')), 0,
  'หน่วยปลายทางยังไม่เห็นชื่อ/เบอร์ผู้แจ้งจนกว่าจะรับ');
select ok((public.case_detail_permissions(pg_temp.id('TF59-C1')) ->> 'acceptTransfer')::boolean
  and not (public.case_detail_permissions(pg_temp.id('TF59-C1')) ->> 'contact')::boolean
  and not (public.case_detail_permissions(pg_temp.id('TF59-C1')) ->> 'cancelTransfer')::boolean,
  'หน้ารายละเอียด: หน่วยปลายทางมีปุ่มรับ ไม่มีปุ่มยกเลิก/ดูเบอร์');
select is((select array_agg(case_code) from public.list_incoming_transfers()), array['TF59-C1'],
  'คิว "รอรับส่งต่อ" ของหน่วยปลายทาง');
select pg_temp.as_user(6);
select is((select count(*)::int from public.list_incoming_transfers()), 0,
  'หน่วยอื่นไม่เห็นคำขอที่ไม่ได้ส่งถึงตัวเอง');
select is((select count(*)::int from public.cases where case_code = 'TF59-C1'), 0,
  'หน่วยอื่นต่างจังหวัดยังมองไม่เห็นเคส');
reset role;

-- ---------- 4. หน้าติดตามของผู้แจ้ง ----------
select ok((public.get_case_tracking('TF59-C1', null,
  (select tracking_token from public.cases where case_code = 'TF59-C1')) ->> 'transferPending')::boolean,
  'หน้าติดตามรู้ว่ากำลังส่งต่อ');
select ok(position('หน่วยเรือใกล้' in public.get_case_tracking('TF59-C1', null,
  (select tracking_token from public.cases where case_code = 'TF59-C1'))::text) = 0,
  'หน้าติดตามไม่บอกชื่อหน่วยปลายทางจนกว่าจะรับ');

-- ---------- 5. กดรับ: version กันกดพร้อมกัน ย้ายเคสในคำสั่งเดียว ----------
create temp table tr as select pg_temp.pending('TF59-C1') as id;
grant select on tr to authenticated;
set local role authenticated;
select pg_temp.as_user(1);
select throws_ok($$select public.accept_transfer((select id from tr), pg_temp.ver('TF59-C1'))$$,
  '42501', null, 'หน่วยเดิมกดรับคำขอของตัวเองไม่ได้');
select pg_temp.as_user(4);
select is(public.accept_transfer((select id from tr), pg_temp.ver('TF59-C1') - 1) ->> 'status', 'STALE',
  'version เก่า (หน่วยเดิมเพิ่งอัปเดต): ให้โหลดใหม่');
select is(public.accept_transfer((select id from tr), pg_temp.ver('TF59-C1')) ->> 'status', 'ACCEPTED',
  'หน่วยปลายทางกดรับได้');
select pg_temp.as_user(5);
select is(public.accept_transfer((select id from tr), pg_temp.ver('TF59-C1')) ->> 'status', 'NOT_PENDING',
  'คนที่สองกดรับซ้ำไม่ได้');
reset role;

select ok((select status = 'ACCEPTED' and assigned_unit_id = 'c5900000-0000-0000-0000-000000000002'
    and assigned_rescuer_id = 'b5900000-0000-0000-0000-000000000004'
  from public.cases where case_code = 'TF59-C1'),
  'เคสย้ายไปหน่วยปลายทาง (หน่วยเดียว) คนกดรับเป็นผู้รับเคส เริ่มที่ ACCEPTED');
select is((select status from public.case_transfers where id = (select id from tr)), 'accepted',
  'คำขอเป็น accepted');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF59-C1')
  and event_type = 'TRANSFER_ACCEPTED' and from_status = 'EN_ROUTE' and to_status = 'ACCEPTED'), 1,
  'case_events บันทึกการรับส่งต่อ');
select is(current_setting('app.case_transfer', true), 'off', 'ปิดช่องทางส่งต่อหลังใช้เสร็จ');
select throws_ok($$update public.cases set status = 'NEW' where case_code = 'TF59-C2'$$,
  '23514', null, 'นอก RPC ส่งต่อ ยังถอยกลับ NEW ตรงๆ ไม่ได้');

set local role authenticated;
select pg_temp.as_user(4);
select is((select count(*)::int from public.case_contacts where case_id = pg_temp.id('TF59-C1')), 0,
  'ข้อมูลติดต่อยังผ่าน reveal_case_contact ตามเดิม (ไม่เปิดตารางตรง)');
select ok((public.case_detail_permissions(pg_temp.id('TF59-C1')) ->> 'contact')::boolean,
  'รับแล้ว: คนรับเคสใหม่มีสิทธิ์ดูข้อมูลติดต่อ');
select pg_temp.as_user(2);
select is((select sum(referred)::int from public.unit_daily_stats
  where unit_id = 'c5900000-0000-0000-0000-000000000001'), 1,
  'TF-57: หน่วยเดิมนับเป็น "ส่งต่อ" 1 เคส');
reset role;

-- ---------- 6. ยกเลิก ----------
set local role authenticated;
select pg_temp.as_user(1);
select public.request_transfer(pg_temp.id('TF59-C2'), pg_temp.ver('TF59-C2'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ไม่มีเรือ น้ำสูง');
select pg_temp.as_user(4);
select throws_ok(format('select public.cancel_transfer(%L)', pg_temp.pending('TF59-C2')),
  '42501', null, 'หน่วยปลายทางยกเลิกไม่ได้ (ใช้วิธีไม่กดรับ)');
select pg_temp.as_user(2);
select is(public.cancel_transfer(pg_temp.pending('TF59-C2')) ->> 'status', 'CANCELLED',
  'หัวหน้าหน่วยเดิมยกเลิกคำขอได้');
reset role;
select ok((select assigned_unit_id = 'c5900000-0000-0000-0000-000000000001' and status = 'ACCEPTED'
  from public.cases where case_code = 'TF59-C2'), 'ยกเลิกแล้ว เคสอยู่กับหน่วยเดิม');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF59-C2')
  and event_type = 'TRANSFER_CANCELLED'), 1, 'case_events บันทึกการยกเลิก');

-- ---------- 7. เคสเปลี่ยนไปก่อน (ปล่อยเคส) → ยกเลิกคำขออัตโนมัติ ----------
set local role authenticated;
select pg_temp.as_user(1);
select public.request_transfer(pg_temp.id('TF59-C2'), pg_temp.ver('TF59-C2'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ขอส่งต่ออีกครั้ง');
select public.release_case(pg_temp.id('TF59-C2'), pg_temp.ver('TF59-C2'), 'ไปไม่ได้แล้ว');
reset role;
select is((select status from public.case_transfers where case_id = pg_temp.id('TF59-C2')
  order by created_at desc limit 1), 'cancelled', 'ปล่อยเคสระหว่างรอ: คำขอถูกยกเลิกอัตโนมัติ');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF59-C2')
  and event_type = 'TRANSFER_CANCELLED' and actor_role = 'SYSTEM'), 1, 'case_events บันทึกว่าระบบยกเลิก');

-- ---------- 8. หมดเวลา 15 นาที ----------
set local role authenticated;
select pg_temp.as_user(1);
select public.accept_case(pg_temp.id('TF59-C4'), pg_temp.ver('TF59-C4'));
select public.advance_case_status(pg_temp.id('TF59-C4'), pg_temp.ver('TF59-C4'), 'EN_ROUTE');
select public.advance_case_status(pg_temp.id('TF59-C4'), pg_temp.ver('TF59-C4'), 'ON_SITE');
select public.request_transfer(pg_temp.id('TF59-C4'), pg_temp.ver('TF59-C4'),
  'c5900000-0000-0000-0000-000000000002', array['BOAT'], 'ต้องใช้เรือ น้ำลึก');
reset role;

select is(rls.expire_case_transfers(), 0, 'ยังไม่ครบ 15 นาที: ไม่หมดเวลา');
update public.case_transfers set expires_at = now() - interval '1 second' where case_id = pg_temp.id('TF59-C4');
delete from public.line_red_case_queue where case_id = pg_temp.id('TF59-C4');
select is(rls.expire_case_transfers(), 1, 'ครบ 15 นาที: หมดเวลา 1 คำขอ');
select ok((select status = 'NEW' and assigned_unit_id is null and assigned_rescuer_id is null
    and required_capabilities = array['BOAT']
  from public.cases where case_code = 'TF59-C4'),
  'เคสกลับเป็น NEW (จาก ON_SITE) ไม่มีเจ้าของ พร้อมแท็กความสามารถที่ต้องใช้');
select is((select status from public.case_transfers where case_id = pg_temp.id('TF59-C4')), 'expired',
  'คำขอเป็น expired');
select is((select count(*)::int from public.case_events where case_id = pg_temp.id('TF59-C4')
  and event_type = 'TRANSFER_EXPIRED' and from_status = 'ON_SITE' and to_status = 'NEW'), 1,
  'case_events บันทึกการหมดเวลา');
select is((select count(*)::int from public.case_line_notifications where case_id = pg_temp.id('TF59-C4')
  and kind = 'TRANSFER_EXPIRED' and user_id = 'b5900000-0000-0000-0000-000000000002'), 1,
  'แจ้งหัวหน้าหน่วยเดิมทาง LINE');
select is((select exclude_user_id from public.line_red_case_queue where case_id = pg_temp.id('TF59-C4')
  and processed_at is null), 'b5900000-0000-0000-0000-000000000001'::uuid,
  'เคสแดง: เข้าคิวแจ้งเตือนซ้ำ (ยกเว้นคนที่ถือเคสเดิม)');
select is((select array_agg(distinct unit_id order by unit_id) from public.list_red_alert_candidates(pg_temp.id('TF59-C4'))),
  array['c5900000-0000-0000-0000-000000000002', 'c5900000-0000-0000-0000-000000000003']::uuid[],
  'แจ้งเตือนซ้ำไปสมาชิกหน่วยที่มีเรือ (ข้ามจังหวัดได้) ไม่รวมหน่วยตัวอย่าง/หน่วยที่ไม่มีเรือ');
select is((select unit_id from public.list_red_alert_candidates(pg_temp.id('TF59-C4')) limit 1),
  'c5900000-0000-0000-0000-000000000002'::uuid, 'หน่วยที่ใกล้เคสได้แจ้งก่อน');
select is((select required_capabilities from public.claim_red_case_fanouts()
  where case_id = pg_temp.id('TF59-C4')), array['BOAT'], 'worker ได้แท็กไปคัดผู้รับ');

-- มีคนรับเคสที่ติดแท็ก → ล้างแท็ก
set local role authenticated;
select pg_temp.as_user(1);
select public.accept_case(pg_temp.id('TF59-C4'), pg_temp.ver('TF59-C4'));
reset role;
select is((select required_capabilities from public.cases where case_code = 'TF59-C4'), '{}'::text[],
  'มีคนรับเคสแล้ว แท็กถูกล้าง');

-- ---------- 9. แอดมินตั้งพิกัดหน่วย ----------
set local role authenticated;
select pg_temp.as_user(7);
select is(public.admin_manage('unit_location', jsonb_build_object(
  'unitId', 'c5900000-0000-0000-0000-000000000003', 'lat', 18.14, 'lng', 100.14)) ->> 'lat', '18.14',
  'แอดมินตั้งพิกัดหน่วยได้');
select throws_ok($$select public.admin_manage('unit_location', jsonb_build_object(
  'unitId', 'c5900000-0000-0000-0000-000000000003', 'lat', 40, 'lng', 100))$$,
  '22023', null, 'พิกัดนอกประเทศไทย: ไม่ผ่าน');
select pg_temp.as_user(2);
select throws_ok($$select public.admin_manage('unit_location', jsonb_build_object(
  'unitId', 'c5900000-0000-0000-0000-000000000003', 'lat', 18.14, 'lng', 100.14))$$,
  '42501', null, 'คนที่ไม่ใช่แอดมินตั้งพิกัดหน่วยไม่ได้');
reset role;

select * from finish();
rollback;
