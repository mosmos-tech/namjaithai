-- Keep incident types closed until their guidance and severity scoring are reviewed.
-- Preserve the current flood setting; this migration follows the deployed TF-51/TF-65 migrations.
update public.incident_types
set is_enabled = false
where code <> 'FLOOD';
