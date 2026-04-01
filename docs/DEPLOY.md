# 🚀 Guia de Deploy no GitHub

## Passo a passo para publicar no GitHub

### 1. Criar repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Nome do repositório: `performance-engine`
3. Descrição: `⚡ Organizador diário inteligente — combata a procrastinação e maximize sua performance`
4. Marque como **Public**
5. **NÃO** marque "Add a README" (já temos um)
6. Clique em **Create repository**

### 2. Subir os arquivos

Após criar o repositório, abra o terminal e execute:

```bash
# Navegue até a pasta do projeto (onde está este arquivo)
cd performance-engine

# Inicialize o git
git init

# Adicione todos os arquivos
git add .

# Faça o primeiro commit
git commit -m "🚀 Versão inicial do Performance Engine"

# Conecte ao repositório remoto (substitua SEU-USUARIO)
git remote add origin https://github.com/SEU-USUARIO/performance-engine.git

# Renomeie a branch principal para main
git branch -M main

# Envie para o GitHub
git push -u origin main
```

### 3. Ativar GitHub Pages (site online grátis)

1. No repositório, vá em **Settings** (ícone de engrenagem)
2. No menu lateral, clique em **Pages**
3. Em **Source**, selecione:
   - Branch: `main`
   - Folder: `/public`
4. Clique em **Save**
5. Aguarde 1-2 minutos
6. Seu app estará live em: `https://SEU-USUARIO.github.io/performance-engine/`

### 4. Personalizar

Após o deploy, lembre-se de:

- [ ] Substituir `SEU-USUARIO` no README.md pelo seu username do GitHub
- [ ] Adicionar a URL do GitHub Pages no campo "Website" do repositório
- [ ] Adicionar topics: `productivity`, `task-manager`, `javascript`, `web-app`, `timer`

---

## 📁 Estrutura dos arquivos

```
performance-engine/
├── public/
│   └── index.html     ← Este é o arquivo que o GitHub Pages vai servir
├── src/
│   └── App.jsx        ← Componente React (para uso em projetos React)
├── docs/
│   └── DEPLOY.md      ← Este arquivo
├── .gitignore
├── LICENSE
└── README.md
```

## 🔄 Atualizações futuras

Para enviar novas mudanças:

```bash
git add .
git commit -m "Descrição da mudança"
git push
```

O GitHub Pages atualiza automaticamente em ~1 minuto.
