-- TF-14: update from the verified server-calculated priority score.
create or replace function public.reporter_case(
  p_case_code text, p_token text, p_action text default 'read', p_payload jsonb default '{}'
) returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  c public.cases%rowtype;
  p public.case_people%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_score integer;
  v_water public.water_level;
  v_from_status public.case_status;
begin
  select * into c from public.cases
    where case_code = upper(btrim(p_case_code)) and tracking_token = p_token
    for update;
  if not found then return null; end if;
  if p_action = 'score_context' then
    return jsonb_build_object('urgency', c.urgency, 'createdAt', c.created_at);
  end if;
  v_from_status := c.status;
  select * into p from public.case_people where case_id = c.id for update;
  v_before := jsonb_build_object('waterLevel', c.water_level, 'notes', coalesce(c.notes, ''),
    'adults', p.adults, 'elderly', p.elderly, 'bedridden', p.bedridden,
    'children', p.children, 'pets', p.pets, 'priorityScore', c.priority_score);
  if p_action <> 'read' then
    if c.status in ('RESOLVED', 'CANCELLED', 'DUPLICATE', 'UNREACHABLE') then
      raise exception 'case closed' using errcode = 'SOS40';
    end if;
    if (p_payload ->> 'version')::integer is distinct from c.version then
      raise exception 'version conflict' using errcode = 'SOS41';
    end if;
    if p_action = 'update' then
      v_water := (p_payload ->> 'waterLevel')::public.water_level;
      if p_payload ->> 'urgency' is distinct from c.urgency::text then
        raise exception 'priority context changed' using errcode = 'SOS41';
      end if;
      v_score := (p_payload ->> 'priorityScore')::integer;
      if v_score is null then
        raise exception 'priority score is required';
      end if;
      update public.case_people set
        adults = (p_payload ->> 'adults')::integer,
        elderly = (p_payload ->> 'elderly')::integer,
        bedridden = (p_payload ->> 'bedridden')::integer,
        children = (p_payload ->> 'children')::integer,
        pets = (p_payload ->> 'pets')::integer
      where case_id = c.id returning * into p;
      update public.cases set water_level = v_water,
        notes = nullif(btrim(p_payload ->> 'notes'), ''), priority_score = v_score,
        version = version + 1 where id = c.id returning * into c;
    elsif p_action = 'cancel' then
      update public.cases set status = 'CANCELLED', closed_at = now(),
        last_status_updated_at = now(), version = version + 1
        where id = c.id returning * into c;
    else
      raise exception 'invalid action';
    end if;
  end if;
  v_result := jsonb_build_object('version', c.version, 'waterLevel', c.water_level,
    'notes', coalesce(c.notes, ''), 'adults', p.adults, 'elderly', p.elderly,
    'bedridden', p.bedridden, 'children', p.children, 'pets', p.pets);
  if p_action <> 'read' then
    insert into public.case_events(case_id, event_type, from_status, to_status, actor_role, metadata)
      values(c.id, (case when p_action = 'cancel' then 'CANCELLED' else 'REPORTER_UPDATED' end)::public.case_event_type,
        v_from_status, c.status, 'GUEST',
        jsonb_build_object('source', 'REPORTER_TRACKING', 'before', v_before,
          'after', v_result || jsonb_build_object('priorityScore', c.priority_score),
          'reason', case when p_action = 'cancel' then 'SAFE' end));
  end if;
  return v_result;
end;
$$;
revoke all on function public.reporter_case(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.reporter_case(text, text, text, jsonb) to service_role;
