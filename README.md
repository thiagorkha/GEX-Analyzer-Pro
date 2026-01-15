# 📊 Gamma Terminal Pro v2.5

Terminal quantitativo de alta performance para análise de **Gamma Exposure (GEX)**. Esta ferramenta foi desenhada para traders profissionais que buscam entender o posicionamento dos Market Makers e prever zonas de aceleração ou compressão de volatilidade.

## 🧠 Motor de Decisão
O terminal não apenas visualiza dados, ele interpreta o regime de mercado:

### 1. Regime de Gamma Positivo
*   **Comportamento MM**: Comprar ralis, vender quedas (Mean Reversion).
*   **Impacto**: Volatilidade suprimida, mercado "colado" nos strikes.
*   **Estratégia**: Venda de volatilidade (Theta Gang), Iron Condors, busca por reversão à média.

### 2. Regime de Gamma Negativo
*   **Comportamento MM**: Vender quedas, comprar ralis (Momentum).
*   **Impacto**: Volatilidade expandida, movimentos rápidos e direcionais (Gapped moves).
*   **Estratégia**: Compra de volatilidade (Long Gamma), Straddles, acompanhamento de tendência.

## 🛠️ Parâmetros Operacionais
*   **Call Wall**: O maior teto de gamma positivo. Atua como resistência magnética.
*   **Put Wall**: O maior suporte de gamma negativo. Atua como suporte ou acelerador de queda se rompido.
*   **Gamma Flip**: O strike onde a dinâmica de hedge muda completamente.
*   **Gamma Pin**: O strike onde o mercado tem maior probabilidade de encerrar no vencimento devido ao Open Interest massivo.

## 📄 Requisitos do Arquivo
O importador suporta `.xlsx`, `.xls` e `.csv`. Certifique-se de que sua planilha contenha:
*   `strike`: Preço de exercício.
*   `type`: 'CALL' ou 'PUT'.
*   `gamma`: Valor do gamma (ex: 0.0012).
*   `oi`: Open Interest total do strike.

---
*Aviso: O Gamma Terminal Pro é uma ferramenta analítica baseada em modelos matemáticos. Trading de opções envolve risco significativo.*
