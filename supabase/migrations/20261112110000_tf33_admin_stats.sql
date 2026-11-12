-- TF-33: สถิติแอดมินสรุปในฐานข้อมูล ไม่ดึงข้อมูลส่วนตัวหรือจำกัดที่ 1,000 เคส
create function public.admin_case_statistics(p_province text default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not coalesce(rls.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  with relevant as (
    select c.status, c.urgency, c.incident_type, c.province, c.created_at, c.closed_at
    from public.cases c where not c.is_demo and (nullif(p_province, '') is null or c.province = p_province)
  ), period as (
    select * from relevant c
    where (p_from is null or c.created_at >= (p_from::timestamp at time zone 'Asia/Bangkok'))
      and (p_to is null or c.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok'))
  )
  select pg_catalog.jsonb_build_object(
    'open', (select count(*) from relevant where status in ('NEW','ACCEPTED','EN_ROUTE','ON_SITE','AWAITING_CONFIRMATION')),
    'critical_waiting', (select count(*) from relevant where status = 'NEW' and urgency = 'RED'),
    'helping', (select count(*) from relevant where status in ('ACCEPTED','EN_ROUTE','ON_SITE')),
    'closed_today', (select count(*) from relevant where status in ('RESOLVED','CANCELLED','DUPLICATE','UNREACHABLE') and (closed_at at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date),
    'urgencies', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select urgency::text name, count(*) n from period group by urgency) s), '[]'::jsonb),
    'provinces', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select coalesce(province, 'ไม่ระบุ') name, count(*) n from period group by province) s), '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by name) from (select incident_type::text name, count(*) n from period group by incident_type) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_case_statistics(text, date, date) from public, anon;
grant execute on function public.admin_case_statistics(text, date, date) to authenticated;
