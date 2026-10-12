-- =====================================================================
-- Lighthouse PTC (Parent-Teacher Conference) Supabase Schema Setup
-- Supabase Dashboard > SQL Editor 에 아래 스크립트를 붙여넣고 [Run]을 실행하세요.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ptc_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) and allow public read/write for the app
ALTER TABLE public.ptc_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to ptc_state" ON public.ptc_state;
CREATE POLICY "Allow full access to ptc_state"
  ON public.ptc_state
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default initial state row if not exists
INSERT INTO public.ptc_state (id, payload, updated_at)
VALUES ('default', '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
