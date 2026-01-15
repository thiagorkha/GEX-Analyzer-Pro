# ✅ Checklist de Deploy - Render

Siga estas configurações no painel do **Render** para garantir que o site estático funcione corretamente:

### 1. Tipo de Serviço
- Selecione **Static Site**.

### 2. Configurações Básicas
- **Build Command:** Deixe **Vazio** (não é necessário build se estiver usando import maps).
- **Publish Directory:** `.` (ponto final, indicando a raiz).

### 3. Solução de Erros Comuns
- **Erro de Mime Type / SyntaxError:**
  - Verifique se você não tem uma extensão do Chrome (como tradutores ou adblockers) injetando scripts na página. O erro `chrome-extension://...` indica interferência externa.
  - Certifique-se de que o arquivo `index.tsx` está na raiz do projeto.
- **Erro 404 (Favicon):**
  - O código atual já inclui um favicon inline (`data:image/...`) para evitar este erro.

### 4. Headers (Opcional)
Se o Render suportar, adicione este Header para performance:
- **Key:** `Cache-Control`
- **Value:** `no-cache` (durante a fase de desenvolvimento/construção).

### 5. Verificação de Código
- [x] `index.html` contém o `<script type="importmap">`.
- [x] O elemento `<div id="root">` está presente no body.
- [x] Nenhuma tag `<script src="index.tsx">` manual foi adicionada (o sistema faz isso automaticamente).