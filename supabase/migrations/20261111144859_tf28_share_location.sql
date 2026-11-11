-- ============================================================================
-- TF-28: แชร์ตำแหน่งกู้ภัย (โหมดปฏิบัติงาน)
--   1. rescuer_locations เก็บแค่ตำแหน่งล่าสุด 1 แถวต่อคน (ไม่มีเส้นทางย้อนหลัง) — หยุดแชร์ = ลบแถวทิ้ง
--      เขียนผ่าน share_my_location / stop_sharing_location เท่านั้น (จังหวัดคำนวณจากพิกัดที่เซิร์ฟเวอร์)
--   2. ใครเห็น: เจ้าของ / แอดมินทุกจังหวัด / กู้ภัย-หัวหน้าที่จังหวัดของหน่วยตรงกับจังหวัดที่อยู่ตอนนี้
--      และอัปเดตไม่เกิน 15 นาที · ผู้แจ้ง/ผู้ใช้ทั่วไปไม่เห็น (TF-42 จะเปิดเฉพาะทีมที่รับเคสตัวเอง)
--   3. Realtime: เพิ่ม rescuer_locations เข้า publication เดิม (หน้าเว็บฟังในช่องเดิมของ TF-27
--      แล้วดึงทั้งชุดผ่าน list_team_locations — ไม่ส่งตำแหน่งรายคนผ่าน Realtime)
--   4. pg_cron ลบแถวที่ไม่อัปเดตเกิน 1 ชม. (แบตหมด/เน็ตหลุด ส่งคำสั่งหยุดไม่ทัน)
--   5. advance_case_status: ON_SITE เก็บระยะห่างจากเคส (เมตร) หรือ location_unavailable ลง case_events
--   6. ด่าน TF-57 FAR_FROM_SCENE (> 1 กม.) + คิวตรวจผลงานคืนข้อมูลประกอบ (notes)
--   7. แจ้ง LINE เคสแดง (TF-34): คนที่แชร์ตำแหน่ง = รัศมี 5 กม. · ไม่แชร์ = จังหวัด/อำเภอเหมือนเดิม
-- เนื้อฟังก์ชันที่แก้คัดจากเวอร์ชันล่าสุด (pg_get_functiondef) แก้เฉพาะส่วนที่มีคอมเมนต์ TF-28
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. สิทธิ์ตาราง: อ่านตาม RLS ใหม่ เขียนผ่าน RPC เท่านั้น
-- ----------------------------------------------------------------------------
delete from public.rescuer_locations; -- ไม่เคยมีโค้ดเขียน (ยังไม่มีข้อมูลจริง) เริ่มใหม่ตามกติกาใหม่
comment on table public.rescuer_locations is
  'TF-28 ตำแหน่งล่าสุดของกู้ภัยที่เปิดโหมดปฏิบัติงาน 1 แถวต่อคน — หยุดแชร์ลบทิ้ง ไม่มีประวัติย้อนหลัง';
revoke insert, update, delete on public.rescuer_locations from authenticated;
drop policy if exists "read locations in same unit" on public.rescuer_locations;
drop policy if exists "rescuer writes own location" on public.rescuer_locations;
drop policy if exists "rescuer updates own location" on public.rescuer_locations;

create function rls.can_see_rescuer_location(p_user_id uuid, p_province text, p_recorded_at timestamptz)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id = rls.current_user_id()
    or rls.is_admin()
    or (p_recorded_at > now() - interval '15 minutes'
        and p_province in (select rls.my_provinces()));
$$;
revoke all on function rls.can_see_rescuer_location(uuid, text, timestamptz) from public, anon;
grant execute on function rls.can_see_rescuer_location(uuid, text, timestamptz) to authenticated;

create policy "see team locations in my provinces" on public.rescuer_locations
  for select to authenticated
  using ((select rls.can_see_rescuer_location(user_id, province, recorded_at)));

-- ----------------------------------------------------------------------------
-- 2. RPC: แชร์ / หยุดแชร์ / ดูตำแหน่งทีม
-- ----------------------------------------------------------------------------
create function public.share_my_location(p_lat double precision, p_lng double precision, p_accuracy_m double precision)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := rls.current_user_id();
  v_unit uuid;
  v_province text;
begin
  -- กู้ภัย/หัวหน้าที่อยู่ในหน่วย (อนุมัติแล้ว) เท่านั้น
  select m.unit_id into v_unit
  from public.unit_members m
  where m.user_id = v_actor and m.unit_id in (select rls.my_unit_ids())
  order by m.approved_at nulls last, m.unit_id
  limit 1;
  if v_actor is null or v_unit is null then
    raise exception 'location sharing requires an active unit membership' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 5 and 21 or p_lng not between 97 and 106 then
    raise exception 'location must be in Thailand' using errcode = '22023';
  end if;
  -- ตรงกับ TEAM_LOCATION_MAX_ACCURACY_M ใน src/lib/domain
  if p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 1000 then
    raise exception 'accuracy must be within 1000 m' using errcode = '22023';
  end if;
  -- หน้าเว็บส่งไม่ถี่กว่า 15 วินาที — กันเครื่องที่ถูกดัดแปลงยิงรัว
  if exists (select 1 from public.rescuer_locations r
             where r.user_id = v_actor and r.recorded_at > now() - interval '10 seconds') then
    return jsonb_build_object('status', 'TOO_SOON');
  end if;
  select a.province_name_th into v_province from public.locate_admin_area(p_lat, p_lng) a;

  insert into public.rescuer_locations as r
    (user_id, unit_id, active_case_id, location, lat, lng, accuracy_m, heading, speed_mps,
     province, is_sharing, recorded_at)
  values (
    v_actor, v_unit,
    (select c.id from public.cases c
     where c.assigned_rescuer_id = v_actor and c.status in ('ACCEPTED', 'EN_ROUTE', 'ON_SITE')
       and not c.is_demo
     order by c.last_status_updated_at desc nulls last limit 1),
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_lat, p_lng, p_accuracy_m, null, null, v_province, true, now()
  )
  on conflict (user_id) do update
    set unit_id = excluded.unit_id, active_case_id = excluded.active_case_id,
        location = excluded.location, lat = excluded.lat, lng = excluded.lng,
        accuracy_m = excluded.accuracy_m, province = excluded.province,
        is_sharing = true, recorded_at = excluded.recorded_at;
  return jsonb_build_object('status', 'SAVED');
end;
$$;
comment on function public.share_my_location(double precision, double precision, double precision) is
  'TF-28 บันทึกตำแหน่งล่าสุดของตัวเอง (ทับแถวเดิม) — จังหวัดคำนวณจากพิกัด ไม่เก็บทิศทาง/ความเร็ว';

-- หยุดแชร์ทุกกรณี (ปิดโหมด, ออกจากหน้า, ปิดแท็บผ่าน beacon, ออกจากระบบ) = ลบแถวทิ้ง ไม่เก็บพิกัดสุดท้าย
create function public.stop_sharing_location()
returns void
language sql security definer set search_path = '' as $$
  delete from public.rescuer_locations where user_id = rls.current_user_id();
$$;

-- หมุดทีมบนแผนที่กู้ภัย: กติกาเดียวกับ RLS ไม่รวมตัวเอง ไม่มีเบอร์โทร/เคส
create function public.list_team_locations()
returns table (user_id uuid, display_name text, unit_name text, lat double precision,
               lng double precision, accuracy_m double precision, recorded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, u.display_name, un.name, r.lat, r.lng, r.accuracy_m, r.recorded_at
  from public.rescuer_locations r
  join public.users u on u.id = r.user_id
  left join public.units un on un.id = r.unit_id
  where r.user_id <> rls.current_user_id()
    and r.is_sharing
    and r.recorded_at > now() - interval '15 minutes'
    and rls.can_see_rescuer_location(r.user_id, r.province, r.recorded_at)
  order by r.recorded_at desc
  limit 500;
$$;

revoke all on function public.share_my_location(double precision, double precision, double precision) from public, anon;
revoke all on function public.stop_sharing_location() from public, anon;
revoke all on function public.list_team_locations() from public, anon;
grant execute on function public.share_my_location(double precision, double precision, double precision) to authenticated;
grant execute on function public.stop_sharing_location() to authenticated;
grant execute on function public.list_team_locations() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Realtime: ช่องเดิมของ TF-27 ฟังตารางนี้เพิ่ม (Realtime ส่งตาม RLS ด้านบน)
-- ----------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rescuer_locations')
  then
    alter publication supabase_realtime add table public.rescuer_locations;
  end if;
end
$do$;

-- ----------------------------------------------------------------------------
-- 4. ลบแถวที่ไม่อัปเดตเกิน 1 ชม. ทุก 5 นาที
-- ----------------------------------------------------------------------------
create function rls.purge_stale_rescuer_locations()
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.rescuer_locations where recorded_at < now() - interval '1 hour';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function rls.purge_stale_rescuer_locations() from public, anon, authenticated;
select cron.schedule('tf28-rescuer-location-cleanup', '*/5 * * * *', 'select rls.purge_stale_rescuer_locations()');

-- ----------------------------------------------------------------------------
-- 5. ถึงที่เกิดเหตุ: ระยะห่างจากเคส (ไม่เก็บพิกัดกู้ภัย)
-- ----------------------------------------------------------------------------
create or replace function public.advance_case_status(p_case_id uuid, p_expected_version integer, p_to_status case_status, p_note text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_people_helped integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := rls.current_user_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_before public.cases%rowtype;
  v_case public.cases%rowtype;
  v_role text;
  v_metadata jsonb;
  v_version integer;
  v_scene_distance integer; -- TF-28
begin
  -- security definer ข้าม RLS: ต้องเช็กว่ามองเห็นเคสนี้จริง
  if v_actor is null or not rls.can_see_case(p_case_id) then
    raise exception 'case not found' using errcode = '42501';
  end if;
  -- TF-70: เคสตัวอย่าง (is_demo) แยกจากงานจริง รับ/ปล่อย/เลื่อนสถานะ/ใส่โน้ตไม่ได้
  if exists (select 1 from public.cases d where d.id = p_case_id and d.is_demo) then
    raise exception 'demo case' using errcode = '22023';
  end if;
  select * into v_before from public.cases c where c.id = p_case_id;

  -- เฉพาะคนที่รับเคส (ยังเป็นสมาชิกหน่วย) หรือหัวหน้าของหน่วยที่รับ — แอดมินมอบหมายแทน ไม่เลื่อนสถานะเอง
  if v_before.assigned_rescuer_id = v_actor and exists (select 1 from rls.my_unit_ids()) then
    v_role := 'RESCUER';
  elsif v_before.assigned_unit_id in (select rls.my_unit_ids(true)) then
    v_role := 'UNIT_LEAD';
  else
    raise exception 'not allowed to update this case' using errcode = '42501';
  end if;

  -- กู้ภัย/หัวหน้าปิดเคสผ่านทางนี้ไม่ได้ (ผู้แจ้งยืนยัน / หัวหน้าปิด เป็นงาน TF-58 / TF-31)
  if p_to_status in ('NEW', 'RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then
    raise exception 'status % is not allowed here', p_to_status using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'note must be at most 500 characters' using errcode = '22023';
  end if;

  if p_to_status = 'AWAITING_CONFIRMATION' then
    -- ตรงกับ caseCompletionSchema ใน src/lib/domain
    if p_outcome is null or p_outcome not in ('HELPED', 'HOSPITAL', 'OTHER') then
      raise exception 'outcome is required' using errcode = '22023';
    end if;
    if p_people_helped is null or p_people_helped not between 0 and 999 then
      raise exception 'people helped must be 0-999' using errcode = '22023';
    end if;
    if p_outcome = 'OTHER' and v_note is null then
      raise exception 'note is required for OTHER' using errcode = '22023';
    end if;
  elsif p_outcome is not null or p_people_helped is not null then
    raise exception 'outcome only applies when finishing' using errcode = '22023';
  end if;

  -- ทีละขั้นจากสถานะที่เห็นอยู่ (trigger ตรวจซ้ำอีกชั้น) — ข้ามขั้น = INVALID ไม่ใช่ STALE
  if not public.case_status_transition_allowed(v_before.status, p_to_status)
     or v_before.status = p_to_status then
    if v_before.version <> p_expected_version then
      return jsonb_build_object('status', 'STALE', 'version', v_before.version);
    end if;
    raise exception 'invalid case status transition % -> %', v_before.status, p_to_status
      using errcode = '23514';
  end if;

  -- เช็กและเปลี่ยนในคำสั่งเดียว: กดซ้ำ/กดพร้อมกัน คนที่สองได้ 0 แถว (แบบ accept_case)
  update public.cases c
  set status = p_to_status,
      last_status_updated_at = now(),
      version = c.version + 1
  where c.id = p_case_id and c.status = v_before.status and c.version = p_expected_version
  returning * into v_case;
  if not found then
    select c.version into v_version from public.cases c where c.id = p_case_id;
    return jsonb_build_object('status', 'STALE', 'version', v_version);
  end if;

  v_metadata := jsonb_build_object('version', v_case.version)
    || case when p_to_status = 'AWAITING_CONFIRMATION'
         then jsonb_build_object('outcome', p_outcome, 'peopleHelped', p_people_helped)
         else '{}'::jsonb end;
  -- TF-28: ถึงที่เกิดเหตุ — เก็บแค่ระยะห่าง (เมตร) จากตำแหน่งที่แชร์ไม่เกิน 5 นาที ไม่เก็บพิกัดกู้ภัย
  -- วัดจากคนที่รับเคส (หัวหน้ากดแทนจากที่อื่นได้) · ไม่มีตำแหน่ง = location_unavailable (ไม่ติดด่าน)
  if v_case.status = 'ON_SITE' then
    select round(extensions.st_distance(r.location, v_case.location))::integer into v_scene_distance
    from public.rescuer_locations r
    where r.user_id = coalesce(v_case.assigned_rescuer_id, v_actor)
      and r.recorded_at > now() - interval '5 minutes';
    v_metadata := v_metadata || case when v_scene_distance is null
      then jsonb_build_object('sceneLocation', 'location_unavailable')
      else jsonb_build_object('distanceToSceneM', v_scene_distance) end;
  end if;
  insert into public.case_events (
    case_id, event_type, from_status, to_status, actor_user_id, actor_unit_id, actor_role, note, metadata
  )
  values (
    v_case.id, 'STATUS_CHANGED', v_before.status, v_case.status, v_actor, v_case.assigned_unit_id,
    v_role, v_note, v_metadata
  );
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, case_id, metadata)
  values (
    v_actor, 'CASE_STATUS_CHANGED', 'case', v_case.id, v_case.id,
    v_metadata || jsonb_build_object('from', v_before.status, 'to', v_case.status)
  );

  -- ขอให้ผู้แจ้งยืนยันปิดเคสทาง LINE (คิวของ TF-34) — คิวพลาด การเปลี่ยนสถานะยังสำเร็จ
  -- TODO(TF-58): ผู้แจ้งกดยืนยัน / ครบ 24 ชม. ปิดเป็น RESOLVED / คิวหัวหน้า
  if v_case.status = 'AWAITING_CONFIRMATION' then
    begin
      perform public.enqueue_close_confirmation(v_case.id);
    exception when others then
      raise warning 'close confirmation enqueue failed: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('status', 'UPDATED', 'version', v_case.version, 'to', v_case.status);
end;
$function$;

-- ----------------------------------------------------------------------------
-- 6. ด่านกันปั๊มผลงาน TF-57: FAR_FROM_SCENE
-- ----------------------------------------------------------------------------
create or replace function rls.check_case_performance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reasons text[] := '{}';
  v_finished_at timestamptz;
  v_scene_distance integer;
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

  -- (2) TF-28: ตอนกด "ถึงที่เกิดเหตุ" (ครั้งล่าสุด) ห่างจากเคสเกิน 1 กม. → FAR_FROM_SCENE
  --     ไม่มีตำแหน่ง (location_unavailable) ไม่ติดด่าน — คิวตรวจแสดงเป็นข้อมูลประกอบแทน
  select (e.metadata ->> 'distanceToSceneM')::integer into v_scene_distance
  from public.case_events e
  where e.case_id = new.id and e.event_type = 'STATUS_CHANGED' and e.to_status = 'ON_SITE'
  order by e.created_at desc
  limit 1;
  if v_scene_distance > 1000 then
    v_reasons := array_append(v_reasons, 'FAR_FROM_SCENE');
  end if;

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
$function$;

-- คิวตรวจผลงาน: เพิ่ม notes = ข้อมูลประกอบที่ไม่ใช่เหตุติดด่าน (LOCATION_UNAVAILABLE)
drop function public.pending_performance_reviews();
create function public.pending_performance_reviews()
returns table(case_id uuid, case_code text, unit_id uuid, unit_name text, reasons text[], notes text[],
              created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rls.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select r.case_id, c.case_code, r.unit_id, u.name, r.reasons,
      -- TF-28: ครั้งล่าสุดที่กด "ถึงที่เกิดเหตุ" ไม่มีตำแหน่ง
      case when (select e.metadata ->> 'sceneLocation' from public.case_events e
                 where e.case_id = c.id and e.event_type = 'STATUS_CHANGED' and e.to_status = 'ON_SITE'
                 order by e.created_at desc limit 1) = 'location_unavailable'
        then array['LOCATION_UNAVAILABLE'] else '{}'::text[] end,
      r.created_at
    from public.case_performance_reviews r
    join public.cases c on c.id = r.case_id
    join public.units u on u.id = r.unit_id
    where r.status = 'PENDING' and not c.is_demo -- TF-70
    order by r.created_at;
end;
$$;
revoke all on function public.pending_performance_reviews() from public, anon;
grant execute on function public.pending_performance_reviews() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. ผู้รับแจ้ง LINE เคสแดง (TF-34): แชร์ตำแหน่งอยู่ (≤ 15 นาที) = อยู่ในรัศมี 5 กม. จากเคส
--    ไม่แชร์ = หน่วยจังหวัดเดียวกับเคส (หน่วยระบุอำเภอ → อำเภอต้องตรง) เหมือนเดิม
-- ----------------------------------------------------------------------------
create or replace function public.list_red_alert_candidates(p_case_id uuid)
returns table(unit_id uuid, capabilities text[], user_id uuid)
language sql stable set search_path = '' as $$
  select un.id,
    coalesce((select array_agg(uc.capability order by uc.capability)
              from public.unit_capabilities uc where uc.unit_id = un.id), '{}'),
    u.id
  from public.cases c
  join public.unit_members m on m.status = 'APPROVED'
    and (m.expires_at is null or m.expires_at > now())
    and m.is_on_duty and m.duty_status <> 'OFFLINE'
  join public.units un on un.id = m.unit_id and un.is_active
  join public.users u on u.id = m.user_id and u.status = 'ACTIVE'
    and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
  left join public.rescuer_locations r on r.user_id = u.id and r.is_sharing
    and r.recorded_at > now() - interval '15 minutes'
  left join public.line_red_case_queue q on q.case_id = c.id
  where c.id = p_case_id and u.id is distinct from c.reporter_user_id
    and u.id is distinct from q.exclude_user_id
    and case
      when r.user_id is not null then extensions.st_dwithin(r.location, c.location, 5000)
      else un.province = c.province
        and (un.district is null or c.district is null or un.district = c.district)
    end
  order by un.created_at, un.id, m.approved_at nulls last, u.id
$$;
