-- ป้องกันบัญชีที่ถูกระงับ/ปฏิเสธไม่ให้ยื่นสมัครเข้าหน่วยผ่าน invite
create or replace function public.join_unit_with_invite(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_unit_active boolean;
  v_membership public.unit_members%rowtype;
  v_user_role public.user_role;
  v_user_status public.user_status;
begin
  select * into v_invite from public.invites i where i.token = p_token for update;
  if not found or not v_invite.is_active or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() or v_invite.used_count >= v_invite.max_uses then
    raise exception using errcode = 'P0001', message = 'invite unavailable';
  end if;

  select u.is_active into v_unit_active from public.units u where u.id = v_invite.unit_id;
  if coalesce(v_unit_active, false) = false then
    raise exception using errcode = 'P0001', message = 'unit unavailable';
  end if;

  select m.* into v_membership from public.unit_members m
  where m.unit_id = v_invite.unit_id and m.user_id = p_user_id;
  if found then
    return jsonb_build_object('status', v_membership.status, 'already_member', true);
  end if;

  select u.role, u.status into v_user_role, v_user_status
  from public.users u where u.id = p_user_id for update;
  if not found or v_user_status <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'user unavailable';
  end if;

  insert into public.unit_members (unit_id, user_id, role_in_unit, status, invite_id)
  values (v_invite.unit_id, p_user_id, 'MEMBER', 'PENDING', v_invite.id);
  update public.users
  set role = case when v_user_role = 'USER' then 'RESCUER'::public.user_role else v_user_role end,
      updated_at = now()
  where id = p_user_id;
  update public.invites set used_count = used_count + 1 where id = v_invite.id;

  return jsonb_build_object('status', 'PENDING', 'already_member', false);
end;
$$;

revoke all on function public.join_unit_with_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.join_unit_with_invite(text, uuid) to service_role;
