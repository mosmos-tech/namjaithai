-- Retain existing values for historical cases; add distinct needs for new incidents.
alter type public.need_type add value if not exists 'AMBULANCE';
alter type public.need_type add value if not exists 'VEHICLE_EXTRICATION';
alter type public.need_type add value if not exists 'FIRE_RESCUE';
alter type public.need_type add value if not exists 'WATER_RESCUE';
alter type public.need_type add value if not exists 'DEBRIS_RESCUE';
alter type public.need_type add value if not exists 'ANIMAL_RESPONSE';
