# ✅ Checklist de Deploy - Render

Configurações para **Static Site**:

1. **Build Command**: Deixe vazio.
2. **Publish Directory**: `.` (raiz).
3. **Headers**: Adicione `Cache-Control: no-cache` em Headers se houver problemas de atualização.
4. **Verificação**:
   - Se travar em "Iniciando...", abra o Console (F12). Se houver erro de "Unexpected token", verifique se o arquivo `index.html` não possui caracteres estranhos no `importmap`.