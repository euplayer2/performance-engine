# ⚡ Performance Engine — Organizador Diário

<p align="center">
  <strong>Organize seu dia, combata a procrastinação e maximize sua performance.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versão-1.0.0-E85D3A?style=flat-square" alt="versão">
  <img src="https://img.shields.io/badge/licença-MIT-2EBD6B?style=flat-square" alt="licença">
  <img src="https://img.shields.io/badge/status-ativo-3A8FE8?style=flat-square" alt="status">
</p>

---

## 📖 Sobre

O **Performance Engine** é um organizador de tarefas diárias inteligente que se adapta ao tempo disponível no seu dia. Diferente de apps genéricos de to-do, ele foca em:

- **Tempo real cronometrado** — saiba exatamente quanto tempo você gasta em cada tarefa
- **Anti-procrastinação** — timer obrigatório antes de concluir (sem trapacear!)
- **Eficiência mensurável** — veja quanto tempo você ganhou (ou perdeu) comparado às estimativas
- **Adaptação diária** — dias corridos? Ajuste o tempo disponível e receba sugestões inteligentes

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
| 💾 **Persistência** | Dados salvos automaticamente entre sessões |
| 📱 **Responsivo** | Funciona em desktop, tablet e mobile |

---

## 🚀 Versões

O projeto inclui **duas versões** independentes:

### 🌐 Versão Web (`public/index.html`)

Arquivo HTML único e autossuficiente — sem dependências, sem build. Ideal para:
- Hospedar no GitHub Pages
- Abrir diretamente no navegador
- Compartilhar com qualquer pessoa

**Layout desktop:** sidebar com navegação + área principal com dashboard

**Layout mobile:** bottom tab bar responsivo

### ⚛️ Versão React (`src/App.jsx`)

Componente React standalone para integrar em projetos existentes ou usar em plataformas como Claude Artifacts. Usa:
- React Hooks (`useState`, `useEffect`, `useRef`)
- Persistent Storage API
- Web Audio API para sons

---

## 📦 Instalação e Uso

### Opção 1: Versão Web (mais simples)

```bash
# Clone o repositório
git clone https://github.com/SEU-USUARIO/performance-engine.git

# Abra no navegador
open public/index.html
```

Ou simplesmente faça download do `public/index.html` e abra no navegador.

### Opção 2: GitHub Pages

1. Vá em **Settings → Pages** no seu repositório
2. Em **Source**, selecione `Deploy from a branch`
3. Selecione branch `main` e pasta `/public`
4. Seu app estará disponível em `https://SEU-USUARIO.github.io/performance-engine/`

### Opção 3: Versão React

```bash
# Em um projeto React existente, copie o componente
cp src/App.jsx seu-projeto/src/

# Importe e use
import DailyOrganizer from './App';
```

---

## 🏗️ Estrutura do Projeto

```
performance-engine/
├── public/
│   └── index.html        # Versão web completa (standalone)
├── src/
│   └── App.jsx            # Componente React
├── README.md
├── LICENSE
└── .gitignore
```

---

## 🎨 Design

- **Tema:** Dark mode com gradientes sutis
- **Tipografia:** DM Sans (web) / Outfit (React) + JetBrains Mono / Space Mono
- **Cores:**
  - `#E85D3A` — Accent (laranja)
  - `#2EBD6B` — Sucesso (verde)
  - `#E8A93A` — Alerta (amarelo)
  - `#3A8FE8` — Info (azul)
  - `#B45CE8` — Pessoal (roxo)

---

## 🔧 Tecnologias

- **HTML5 / CSS3 / JavaScript** vanilla (versão web)
- **React 18** com Hooks (versão componente)
- **Web Audio API** para sons de conclusão
- **LocalStorage** (web) / **Persistent Storage API** (React) para persistência
- **Zero dependências externas** na versão web

---

## 📱 Como Usar

1. **Defina seu tempo disponível** — use o slider para ajustar (30min a 16h)
2. **Adicione tarefas** — nome, categoria, prioridade e duração estimada
3. **Inicie o timer** — aperte ▶ na tarefa que vai começar
4. **Trabalhe focado** — o cronômetro conta seu tempo real
5. **Conclua** — quando terminar, marque como concluída ✓
6. **Analise** — veja nas estatísticas quanto tempo ganhou ou perdeu

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Para contribuir:

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
