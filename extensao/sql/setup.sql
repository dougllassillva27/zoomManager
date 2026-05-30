-- Native Zoom Manager v5.0.0 - Schema Supabase Completo
-- Persistência Inteligente por URL Pattern

-- Tabela de regras de zoom por URL pattern
CREATE TABLE IF NOT EXISTS public.zoom_url_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  zoom_level NUMERIC(4,2) NOT NULL,
  specificity INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoom_url_rules_pattern ON public.zoom_url_rules(pattern);

-- Tabela de presets de zoom
CREATE TABLE IF NOT EXISTS public.presets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT NOT NULL,
  level NUMERIC(4,2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT presets_label_level_unique UNIQUE (label, level)
);

-- Tabela de perfis Smart Zoom por resolução
CREATE TABLE IF NOT EXISTS public.smart_zoom_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resolution_width INTEGER NOT NULL,
  resolution_height INTEGER NOT NULL,
  zoom_level NUMERIC(4,2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT smart_zoom_resolution_unique UNIQUE (resolution_width, resolution_height)
);

-- Tabela de perfis de zoom para PDFs
CREATE TABLE IF NOT EXISTS public.pdf_zoom_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  zoom_level NUMERIC(4,2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de configurações de zoom por hostname (legacy + __default__)
CREATE TABLE IF NOT EXISTS public.zoom_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  zoom_level NUMERIC(4,2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Limpeza de duplicatas existentes (executar uma vez)
-- DELETE FROM public.presets a USING public.presets b
-- WHERE a.id < b.id AND a.label = b.label AND a.level = b.level;
