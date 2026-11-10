-- TF-58: LINE users confirm through their verified account session, not via a secret in a message.
create function public.can_confirm_case_as_reporter(p_case_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cases c join public.users u on u.id = c.reporter_user_id
    where c.case_code = upper(btrim(p_case_code))
      and u.id = rls.current_user_id() and u.status = 'ACTIVE'
      and u.line_user_id ~ '^U[0-9a-fA-F]{32}$'
  )
$$;

create function public.confirm_case_as_reporter(p_case_code text, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item public.cases%rowtype;
  actor uuid := rls.current_user_id();
  secret text;
begin
  select * into item from public.cases c where c.case_code = upper(btrim(p_case_code)) for update;
  if not found or actor is null or item.reporter_user_id is distinct from actor
     or not exists (select 1 from public.users u where u.id = actor and u.status = 'ACTIVE'
       and u.line_user_id ~ '^U[0-9a-fA-F]{32}$') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select s.secret into secret from rls.case_confirmation_secrets s where s.case_id = item.id;
  if secret is null then raise exception 'confirmation unavailable' using errcode = '55000'; end if;
  return public.reporter_confirm_case(item.case_code, secret, p_decision);
end $$;

revoke all on function public.can_confirm_case_as_reporter(text) from public, anon;
revoke all on function public.confirm_case_as_reporter(text,text) from public, anon;
grant execute on function public.can_confirm_case_as_reporter(text) to authenticated;
grant execute on function public.confirm_case_as_reporter(text,text) to authenticated;
