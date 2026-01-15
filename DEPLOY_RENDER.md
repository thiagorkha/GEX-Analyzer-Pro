# 🚀 Deploy no Render (Site Estático)

O **GEX Analyzer Pro 2.0** agora é um site estático. Isso significa que ele é carregado instantaneamente e não tem custo de servidor.

## Passo a Passo
1. No [Render Dashboard](https://dashboard.render.com/), clique em **New +** > **Static Site**.
2. Conecte seu repositório GitHub.
3. Configure:
   - **Build Command:** `(vazio)`
   - **Publish Directory:** `.`
4. Clique em **Deploy**.

O Render servirá os arquivos `index.html` e `index.tsx` (que é transpilado em tempo real pelo navegador via import maps) automaticamente.