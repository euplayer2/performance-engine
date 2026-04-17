# ⚡ Performance Engine — Organizador Diário

<p align="center">
  <strong>Organize seu dia, combata a procrastinação e maximize sua performance.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versão-2.0.0-E85D3A?style=flat-square" alt="versão">
  <img src="https://img.shields.io/badge/licença-MIT-2EBD6B?style=flat-square" alt="licença">
  <img src="https://img.shields.io/badge/status-ativo-3A8FE8?style=flat-square" alt="status">
  <img src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20Supabase-B45CE8?style=flat-square" alt="stack">
</p>

---

## 📖 Sobre

O **Performance Engine** é um organizador de tarefas diárias inteligente que se adapta ao tempo disponível no seu dia. Diferente de apps genéricos de to-do, ele foca em:

- **Tempo real cronometrado** — saiba exatamente quanto tempo você gasta em cada tarefa
- **Anti-procrastinação** — timer obrigatório antes de concluir (sem trapacear!)
- **Eficiência mensurável** — veja quanto tempo você ganhou (ou perdeu) comparado às estimativas
- **Adaptação diária** — dias corridos? Ajuste o tempo disponível e receba sugestões inteligentes
- **Autenticação segura** — seus dados sincronizam em qualquer dispositivo com a mesma conta

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---------|-----------|
| ⏱ **Timer obrigatório** | Precisa iniciar o cronômetro antes de concluir qualquer tarefa |
| 📊 **Tempo real vs estimado** | Compara o tempo que você estimou com o tempo real gasto |
| ⚡ **Ganho de eficiência** | Mostra quanto tempo você economizou ou excedeu |
| 🎯 **Prioridades inteligentes** | Alta, média, baixa — ordena automaticamente |
| 📂 **5 categorias** | Trabalho, Estudo, Saúde, Pessoal, Casa |
| ✏️ **Edição inline** | Edite qualquer tarefa sem sair da tela |
| 🔊 **Som de conclusão** | Arpejo musical ao concluir uma tarefa |
| 🔥 **Streak de dias** | Acompanhe sua sequência de dias produtivos |
| ☁️ **Sincronização** | Dados persistidos no Supabase — acesse de qualquer dispositivo |
| 📱 **Responsivo** | Funciona em desktop, tablet e mobile |

---

## 🚀 Setup

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com) com projeto criado

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
# Copie o arquivo de exemplo
cp .env.example .env.local

# Edite .env.local com suas credenciais
# Dashboard Supabase → Project Settings → API
```

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### 3. Aplicar o banco de dados

Copie e execute o conteúdo de `supabase/migrations/001_init.sql` no **SQL Editor** do seu dashboard Supabase.

Veja as instruções detalhadas em [`supabase/README.md`](./supabase/README.md).

### 4. Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:5173`.

---

## 🏗️ Estrutura do Projeto

```
performance-engine/
├── index.html                    # Entry HTML (Vite)
├── vite.config.js                # Configuração Vite
├── package.json
├── .env.example                  # Template de variáveis de ambiente
├── .env.local                    # ← Criar com suas credenciais (não comitar)
├── src/
│   ├── main.jsx                  # Bootstrap React
│   ├── App.jsx                   # Componente principal
│   ├── components/
│   │   ├── AuthGate.jsx          # Controle de sessão
│   │   └── LoginScreen.jsx       # Tela de login/signup
│   └── lib/
│       ├── supabase.js           # Cliente Supabase
│       └── data.js               # CRUD (tarefas + preferências)
├── supabase/
│   ├── README.md                 # Como aplicar migrations
│   └── migrations/
│       └── 001_init.sql          # Schema inicial
└── docs/
    └── DEPLOY.md                 # Guia de deploy
```

---

## 🎨 Design

- **Tema:** Dark mode com gradientes sutis
- **Tipografia:** Outfit + Space Mono (Google Fonts)
- **Cores:**
  - `#E85D3A` — Accent (laranja)
  - `#2EBD6B` — Sucesso (verde)
  - `#E8A93A` — Alerta (amarelo)
  - `#3A8FE8` — Info (azul)
  - `#B45CE8` — Pessoal (roxo)

---

## 🔧 Tecnologias

- **Vite** — build tool e dev server
- **React 18** com Hooks
- **Supabase** — autenticação + banco PostgreSQL
- **Web Audio API** — sons de conclusão
- **Zero dependências extras** além de `@supabase/supabase-js`

---

## 📱 Como Usar

1. **Cadastre-se** — crie uma conta com email e senha
2. **Defina seu tempo disponível** — use o slider para ajustar (30min a 16h)
3. **Adicione tarefas** — nome, categoria, prioridade e duração estimada
4. **Inicie o timer** — aperte ▶ na tarefa que vai começar
5. **Trabalhe focado** — o cronômetro conta seu tempo real
6. **Conclua** — quando terminar, marque como concluída ✓
7. **Analise** — veja nas estatísticas quanto tempo ganhou ou perdeu

---

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona minha feature'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<p align="center">
  Feito com ⚡ para pessoas que querem extrair o máximo de cada dia.
</p>
