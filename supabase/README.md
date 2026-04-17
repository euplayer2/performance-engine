# Supabase — Como aplicar as migrations

## Sem CLI — só copy-paste

Este projeto usa o **SQL Editor do dashboard Supabase** para aplicar migrations.
Não é necessário instalar a CLI do Supabase.

## Passo a passo

1. Acesse o dashboard do seu projeto em [supabase.com/dashboard](https://supabase.com/dashboard)
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New query**
4. Abra o arquivo `migrations/001_init.sql`
5. Copie **todo** o conteúdo e cole no editor
6. Clique em **Run** (ou `Ctrl + Enter`)
7. Verifique que não houve erros na aba de resultados

## O que a migration cria

- Schema `performance` (isolado do schema público)
- Tabela `performance.user_prefs` — preferências por usuário
- Tabela `performance.tasks` — tarefas por usuário
- Row Level Security em ambas as tabelas (cada usuário vê apenas seus dados)
- Trigger que cria automaticamente as prefs ao registrar um novo usuário
- Trigger que atualiza `updated_at` a cada UPDATE

## Verificação

Após executar, verifique no **Table Editor** que as tabelas aparecem sob o schema `performance`.
