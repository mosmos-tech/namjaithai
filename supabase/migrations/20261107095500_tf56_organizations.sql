-- TF-56: organizations and branches, with explicitly identified sample records.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);
comment on table public.organizations is 'องค์กรที่มีหน่วยหลายสาขา; is_demo ระบุองค์กรสมมติ';
alter table public.organizations enable row level security;
revoke all on public.organizations from public, anon, authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
create policy "signed-in users read organizations" on public.organizations
  for select to authenticated using (true);
create policy "admin manages organizations" on public.organizations
  for all to authenticated using ((select rls.is_admin())) with check ((select rls.is_admin()));
create trigger trg_organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.units
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column branch_name text,
  add column source text not null default 'ADMIN' check (source in ('DEMO', 'OSM', 'ADMIN'));
comment on column public.units.source is 'ที่มาของหน่วย: DEMO ข้อมูลสมมติ / OSM ข้อมูลนำเข้า / ADMIN สร้างโดยแอดมิน';
create unique index units_organization_branch_unique
  on public.units (organization_id, province, district, branch_name) nulls not distinct
  where organization_id is not null;

alter table public.cases add column is_demo boolean not null default false;
comment on column public.cases.is_demo is 'เคสสมมติสำหรับทดสอบและนำเสนอ ไม่ใช่เหตุฉุกเฉินจริง';

-- Lock the referenced unit while checking, so changing its source cannot race a demo insert.
create function public.guard_demo_case_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unit_source text;
begin
  if new.is_demo then
    select u.source into unit_source from public.units u where u.id = new.assigned_unit_id for share;
    if unit_source is distinct from 'DEMO' then
      raise exception 'demo cases require a DEMO unit' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_demo_case_unit() from public, anon, authenticated;
create trigger trg_guard_demo_case_unit before insert or update of is_demo, assigned_unit_id on public.cases
  for each row execute function public.guard_demo_case_unit();

create function public.guard_demo_unit_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.source = 'DEMO' and new.source <> 'DEMO'
    and exists (select 1 from public.cases c where c.is_demo and c.assigned_unit_id = old.id) then
    raise exception 'unit with demo cases must remain DEMO' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_demo_unit_source() from public, anon, authenticated;
create trigger trg_guard_demo_unit_source before update of source on public.units
  for each row execute function public.guard_demo_unit_source();

-- Exclude fictional cases from the public live situation board.
-- TF-46: aggregate only; no case-level or contact data is returned.
create or replace function public.public_situation_summary()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with case_totals as (
    select province,
      count(*) filter (where status = 'NEW')::int as waiting,
      coalesce(sum(rescued_count) filter (
        where status = 'RESOLVED' and resolved_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
      ), 0)::int as rescued
    from public.cases where not is_demo and province is not null group by province
  ), online as (
    select u.province, count(distinct u.id)::int as teams
    from public.units u join public.unit_members m on m.unit_id = u.id
    join public.users usr on usr.id = m.user_id
    where u.source <> 'DEMO' and u.is_active and usr.status = 'ACTIVE' and m.status = 'APPROVED'
      and (m.expires_at is null or m.expires_at > now()) and m.is_on_duty and m.duty_status <> 'OFFLINE'
    group by u.province
  ), by_type as (
    select c.province, c.incident_type, count(*)::int as waiting
    from public.cases c where not c.is_demo and c.status = 'NEW' and c.province is not null
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
