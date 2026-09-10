-- Tabel untuk menyimpan permohonan aksi dari Sub-Admin yang butuh izin Owner
create table if not exists public.admin_requests (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references auth.users(id) on delete cascade,
    requester_email text not null,
    action_type text not null, -- 'set_plan', 'delete_user', 'delete_projects'
    target_user_id uuid not null,
    target_email text,
    payload jsonb default '{}'::jsonb,
    reason text not null,
    status text not null default 'pending', -- 'pending', 'approved', 'rejected'
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

alter table public.admin_requests enable row level security;
