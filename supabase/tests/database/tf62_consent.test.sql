begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);
create function pg_temp.payload() returns jsonb language sql as $$
  select jsonb_build_object('consent', true, 'healthConsent', true, 'consentVersion', '2026-11-06',
    'urgency', 'YELLOW', 'triageReasons', '["CANNOT_SELF_EVACUATE"]'::jsonb,
    'lat', 14.9, 'lng', 100.9, 'landmark', 'test', 'phone', '0898886262',
    'name', 'test', 'adults', 1, 'needs', '[]'::jsonb)
$$;
select throws_ok($$select * from public.create_sos_case('tf62-no-consent', pg_temp.payload() - 'consent', 1)$$, '22023', null, 'missing consent rejected');
select throws_ok($$select * from public.create_sos_case('tf62-no-health', pg_temp.payload() - 'healthConsent', 1)$$, '22023', null, 'missing health consent rejected');
select lives_ok($$select * from public.create_sos_case('tf62-ok', pg_temp.payload(), 1)$$, 'consented SOS is saved');
select is((select consent_version from public.cases where idempotency_key='tf62-ok'), '2026-11-06', 'consent version recorded');
select ok((select consented_at is not null and health_consented_at is not null from public.cases where idempotency_key='tf62-ok'), 'server timestamps recorded');
select * from finish();
rollback;
