-- Native Zoom Manager - Supabase Schema Setup
-- Execute este script no SQL Editor do Supabase Dashboard
-- URL: https://dcndxjhlktxtyectrtzm.supabase.co

-- ============================================================
-- Tabela: zoom_settings
-- Armazena níveis de zoom por hostname (domínio/subdomínio)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.zoom_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  zoom_level NUMERIC(4,2) NOT NULL CHECK (zoom_level >= 0.25 AND zoom_level <= 5.0),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca rápida por hostname
CREATE INDEX IF NOT EXISTS idx_zoom_settings_hostname ON public.zoom_settings(hostname);

-- ============================================================
-- Tabela: presets
-- Armazena presets de zoom customizáveis
-- ============================================================
CREATE TABLE IF NOT EXISTS public.presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL CHECK (char_length(label) <= 20),
  level INTEGER NOT NULL CHECK (level >= 25 AND level <= 500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para ordenação consistente
CREATE INDEX IF NOT EXISTS idx_presets_sort_order ON public.presets(sort_order ASC);

-- ============================================================
-- RLS (Row Level Security)
-- DESABILITADO pois estamos usando anon key sem user auth.
-- Quando migrar para auth de usuário, habilite RLS e crie policies.
-- ============================================================
ALTER TABLE public.zoom_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.presets DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Permissões para role anon (usada pela extensão via anon key)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presets TO anon;

-- ============================================================
-- Comentários para documentação no Supabase Dashboard
-- ============================================================
COMMENT ON TABLE public.zoom_settings IS 'Níveis de zoom persistidos por hostname para a extensão Native Zoom Manager';
COMMENT ON COLUMN public.zoom_settings.hostname IS 'Hostname completo (ex: github.com, docs.google.com)';
COMMENT ON COLUMN public.zoom_settings.zoom_level IS 'Nível de zoom entre 0.25 e 5.0 (1.0 = 100%)';

COMMENT ON TABLE public.presets IS 'Presets de zoom customizáveis definidos pelo usuário';
COMMENT ON COLUMN public.presets.label IS 'Nome do preset (max 20 chars)';
COMMENT ON COLUMN public.presets.level IS 'Nível de zoom em porcentagem (25-500, step 2)';
COMMENT ON COLUMN public.presets.sort_order IS 'Ordem de exibição no popup e context menu';
