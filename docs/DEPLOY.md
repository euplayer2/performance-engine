# 🚀 Guia de Deploy — Performance Engine

## Variáveis de Ambiente Obrigatórias

Configure as seguintes variáveis em **todas** as plataformas de deploy:

| Variável | Onde encontrar |
|----------|----------------|
| `VITE_SUPABASE_URL` | Dashboard Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Dashboard Supabase → Project Settings → API → anon / public key |

> **Nunca** exponha `SUPABASE_SERVICE_ROLE_KEY` em variáveis do cliente.

---

## Deploy na Vercel (recomendado)

### Via interface web

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Conecte seu repositório GitHub
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Clique em **Deploy**

A Vercel detecta automaticamente que é um projeto Vite.

### Via CLI

```bash
npm install -g vercel
vercel --prod
```

---

## Deploy no Netlify

### Via interface web

1. Acesse [app.netlify.com/start](https://app.netlify.com/start)
2. Conecte seu repositório GitHub
3. Configure:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Em **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Faça um redeploy para aplicar as variáveis

### Via CLI

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

---

## Build local

```bash
npm run build
# bundle gerado em dist/
```

---

## Atualizações

Qualquer push para `main` dispara um deploy automático na Vercel/Netlify.

```bash
git add .
git commit -m "Descrição da mudança"
git push
```
