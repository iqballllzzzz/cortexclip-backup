\echo === lebarkan constraint status projects ===
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('pending','uploading','downloading','transcribing','analyzing','rendering','completed','failed'));
