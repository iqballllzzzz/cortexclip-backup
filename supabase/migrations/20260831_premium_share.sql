\echo === premium & share schema ===
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until timestamptz;

CREATE TABLE IF NOT EXISTS public.premium_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id text UNIQUE NOT NULL,
  plan text NOT NULL CHECK (plan IN ('day','5day','month','year')),
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','expired')),
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.premium_orders TO authenticated;
GRANT ALL ON public.premium_orders TO service_role;
ALTER TABLE public.premium_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.premium_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.share_tokens (
  token text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.share_tokens TO service_role;
ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS clip_title text;
ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
