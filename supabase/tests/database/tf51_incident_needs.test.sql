begin;
select plan(2);

select is(
  (select count(*)::int from unnest(enum_range(null::public.need_type)) as n
   where n::text = any(array['AMBULANCE', 'VEHICLE_EXTRICATION', 'FIRE_RESCUE',
     'WATER_RESCUE', 'DEBRIS_RESCUE', 'ANIMAL_RESPONSE'])),
  6,
  'all incident-specific need values exist'
);

select ok('EVACUATE_BEDRIDDEN' = any(enum_range(null::public.need_type)::text[]),
  'legacy need values remain available');

select * from finish();
rollback;
