-- Trigger updated_at otomatis untuk projects & clips.
-- (Bug: updated_at tak pernah berubah → watchdog frontend "macet >10 menit"
--  selalu terpicu → Proses Ulang selalu gagal.)
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_touch_projects on public.projects;
create trigger trg_touch_projects before update on public.projects
  for each row execute function touch_updated_at();

drop trigger if exists trg_touch_clips on public.clips;
create trigger trg_touch_clips before update on public.clips
  for each row execute function touch_updated_at();
