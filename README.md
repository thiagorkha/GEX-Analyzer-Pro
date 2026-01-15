# 📊 GEX Analyzer Pro 2.5

Terminal de alta precisão para análise de **Gamma Exposure (GEX)** diretamente no navegador. Esta ferramenta permite visualizar como a posição dos Market Makers influencia a volatilidade do mercado.

### 🏗️ Status do Projeto
**Versão 2.5 Estável** - Correções aplicadas no motor de renderização e importação de módulos.

---

### ✅ Checklist de Funcionamento (Confira no seu Navegador)
Se a página não carregar, verifique estes pontos:
1. **Conexão**: O app utiliza CDNs (esm.sh, tailwind, plotly) e requer internet para o primeiro carregamento.
2. **Navegador**: Utilize Chrome, Edge ou Brave atualizados.
3. **Extensões**: Algumas extensões (Tradutores, AdBlockers) podem injetar scripts que causam `SyntaxError`. Se houver erro, tente em uma **Aba Anônima**.
4. **Console**: Aperte `F12` e vá em "Console". Se vir erros em vermelho, verifique se são relativos a extensões do Chrome.

---

### 🚀 Como Utilizar
1. **Preço Spot**: Insira o preço atual do ativo (ex: 5800.00).
2. **Importação**: Clique na área de upload e carregue sua planilha.
   - O arquivo deve ter os cabeçalhos: `strike`, `gamma`, `oi` (ou `open_interest`) e `tipo` (ou `type`).
3. **Calcular**: O sistema processará milhares de dados em milissegundos localmente.

### 📈 Interpretação dos Resultados
- **GEX Positivo (Verde)**: Indica um mercado com "amortecimento". Os Market Makers tendem a comprar quedas e vender altas para reequilibrar o delta, reduzindo a volatilidade.
- **GEX Negativo (Vermelho)**: Indica um mercado "instável". Os Market Makers precisam vender conforme o mercado cai e comprar conforme sobe para se protegerem, o que acelera os movimentos e explode a volatilidade.

---
*Nota: Este software é uma ferramenta de visualização de dados e não constitui recomendação de investimento.*