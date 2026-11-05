-- TF-46: aggregate only; no case-level or contact data is returned.
create or replace function public.public_situation_summary()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with case_totals as (
    select province,
      count(*) filter (where status = 'NEW')::int as waiting,
      coalesce(sum(rescued_count) filter (
        where status = 'RESOLVED' and resolved_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
      ), 0)::int as rescued
    from public.cases where province is not null group by province
  ), online as (
    select u.province, count(distinct u.id)::int as teams
    from public.units u join public.unit_members m on m.unit_id = u.id
    join public.users usr on usr.id = m.user_id
    where u.is_active and usr.status = 'ACTIVE' and m.status = 'APPROVED'
      and (m.expires_at is null or m.expires_at > now()) and m.is_on_duty and m.duty_status <> 'OFFLINE'
    group by u.province
  ), by_type as (
    select c.province, c.incident_type, count(*)::int as waiting
    from public.cases c where c.status = 'NEW' and c.province is not null
    group by c.province, c.incident_type
  )
  select jsonb_build_object(
    'provinces', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.name_th, 'teams', coalesce(o.teams, 0), 'waiting', coalesce(c.waiting, 0),
      'rescued', coalesce(c.rescued, 0),
      'incidents', coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'waiting', coalesce(t.waiting, 0)) order by i.sort_order)
        from public.incident_types i left join by_type t on t.incident_type = i.code and t.province = p.name_th), '[]'::jsonb)
    ) order by p.name_th) from public.provinces p left join case_totals c on c.province = p.name_th left join online o on o.province = p.name_th), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'enabled', is_enabled) order by sort_order) from public.incident_types), '[]'::jsonb),
    'generatedAt', now()
  );
$$;
revoke all on function public.public_situation_summary() from public, anon, authenticated;
grant execute on function public.public_situation_summary() to service_role;
