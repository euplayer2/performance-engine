-- ============================================================
-- Performance Engine — Migration 001: Schema inicial
-- Copie e cole este SQL no SQL Editor do dashboard Supabase
-- Dashboard → SQL Editor → New query → Execute
-- ============================================================

CREATE SCHEMA IF NOT EXISTS performance;
GRANT USAGE ON SCHEMA performance TO anon, authenticated;

-- ─── Tabela de preferências do usuário ───
CREATE TABLE performance.user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_time INTEGER NOT NULL DEFAULT 480,
  theme TEXT NOT NULL DEFAULT 'default',
  last_active_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Tabela de tarefas ───
CREATE TABLE performance.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('work','study','health','personal','home')),
  priority TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  duration INTEGER NOT NULL CHECK (duration > 0),
  recurring BOOLEAN NOT NULL DEFAULT false,
  date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  timer_started BOOLEAN NOT NULL DEFAULT false,
  actual_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Índices ───
CREATE INDEX tasks_user_date_idx ON performance.tasks(user_id, date);
CREATE INDEX tasks_user_completed_idx ON performance.tasks(user_id, completed);

-- ─── Row Level Security ───
ALTER TABLE performance.user_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_owner" ON performance.user_prefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_owner" ON performance.tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Grants para authenticated ───
GRANT SELECT, INSERT, UPDATE, DELETE ON performance.user_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON performance.tasks TO authenticated;

-- ─── Trigger: atualizar updated_at automaticamente ───
CREATE OR REPLACE FUNCTION performance.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prefs_touch
  BEFORE UPDATE ON performance.user_prefs
  FOR EACH ROW EXECUTE FUNCTION performance.touch_updated_at();

CREATE TRIGGER tasks_touch
  BEFORE UPDATE ON performance.tasks
  FOR EACH ROW EXECUTE FUNCTION performance.touch_updated_at();

-- ─── Trigger: criar prefs ao registrar novo usuário ───
--
-- SEGURANÇA MULTI-APP: esta função dispara em auth.users, compartilhada entre
-- todas as aplicações do mesmo projeto Supabase. O bloco EXCEPTION garante que
-- uma falha aqui NUNCA quebre o signup de usuários de outras aplicações.
-- Se o INSERT falhar, o app cria a row lazy no primeiro loadPrefs() via upsert.
--
CREATE OR REPLACE FUNCTION performance.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO performance.user_prefs(user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha silenciosa: loga o aviso mas nunca reverte o INSERT em auth.users.
  RAISE WARNING 'performance.handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Prefixo "performance_" evita colisão com triggers de outras apps no mesmo auth.users.
-- DROP IF EXISTS torna a migration re-executável sem "trigger already exists".
DROP TRIGGER IF EXISTS performance_on_auth_user_created ON auth.users;
CREATE TRIGGER performance_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION performance.handle_new_user();
