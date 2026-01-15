
# 🚀 Guia de Deploy - GEX Analyzer Pro 2.0 (Render)

Este guia descreve como hospedar a nova versão do **GEX Analyzer Pro** no Render. Diferente da versão anterior, esta versão é um **Static Site** de alta performance que processa cálculos e IA diretamente no navegador.

## 📋 Pré-requisitos

1.  **Conta no GitHub**: O Render sincroniza automaticamente com seu repositório.
2.  **API Key do Gemini**: Obtenha em [Google AI Studio](https://aistudio.google.com/).
3.  **Repositório**: Certifique-se de que os arquivos `index.html`, `index.tsx` e `metadata.json` estão na raiz do projeto.

---

## 🛠️ Passo 1: Preparar o Repositório

Como a aplicação agora utiliza módulos ES6 diretamente no navegador (via `esm.sh`), o deploy é extremamente simples.

1.  Crie um novo repositório no GitHub.
2.  Suba os arquivos:
    - `index.html`
    - `index.tsx`
    - `metadata.json`

---

## 🚀 Passo 2: Configurar no Render

1.  Acesse o [Dashboard do Render](https://dashboard.render.com/).
2.  Clique em **"New +"** e selecione **"Static Site"**.
3.  Conecte seu repositório do GitHub.
4.  Configure os detalhes da build:
    - **Name**: `gex-analyzer-pro`
    - **Build Command**: `(deixe em branco - não é necessário build step para esta arquitetura)`
    - **Publish Directory**: `.` (o diretório raiz)

---

## 🔑 Passo 3: Variáveis de Ambiente

Para que a inteligência artificial (Gemini) funcione, você precisa configurar a chave de API:

1.  No painel do seu Static Site no Render, vá em **"Environment"**.
2.  Clique em **"Add Environment Variable"**.
3.  Adicione:
    - **Key**: `API_KEY`
    - **Value**: `SUA_CHAVE_AQUI`
4.  Clique em **Save Changes**.

---

## 🌐 Passo 4: Configuração de Redirecionamento (Opcional)

Como se trata de uma Single Page Application (SPA), se você planeja usar rotas, adicione uma regra de "Rewrite" no Render:
- **Source**: `/*`
- **Destination**: `/index.html`
- **Action**: `Rewrite`

---

## 🔍 Solução de Problemas (Nova Estrutura)

### 1. Erro "API_KEY not found"
- Certifique-se de que a variável de ambiente no Render chama-se exatamente `API_KEY`.
- Se estiver testando localmente, o ambiente de desenvolvimento injeta isso automaticamente, mas no Render a aba "Environment" é obrigatória.

### 2. O Excel não carrega
- Verifique se as bibliotecas externas (Tailwind, Plotly, SheetJS) estão sendo carregadas corretamente no `index.html` via CDN.
- O GEX Analyzer Pro 2.0 exige conexão com a internet para baixar esses recursos no primeiro carregamento.

### 3. Falha na Análise (CORS)
- A biblioteca `@google/genai` utilizada no `index.tsx` faz chamadas diretas aos endpoints do Google. Se houver erro de rede, verifique se seu navegador não possui extensões de "AdBlock" que possam estar bloqueando domínios da Google API.

---

## 📈 Vantagens desta nova arquitetura
- **Custo Zero**: Hospedagem como Static Site no Render é gratuita.
- **Privacidade**: Seus dados do Excel nunca saem do seu navegador para um servidor backend proprietário; eles vão apenas para a API segura do Google para análise.
- **Escalabilidade**: Sem servidor backend para sobrecarregar, o app suporta milhares de acessos simultâneos sem lentidão.

---
*Atualizado em: Janeiro de 2024 para GEX Analyzer Pro 2.0*
