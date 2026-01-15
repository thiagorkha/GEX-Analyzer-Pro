
# 📊 Gamma Terminal Pro v2.5

Ferramenta avançada para análise de **Gamma Exposure (GEX)** e previsão de volatilidade baseada no posicionamento de Market Makers.

## ⚙️ Como Funciona
O terminal calcula a exposição teórica dos market makers em cada strike. 
- **Fórmula:** `GEX = Gamma * Open Interest * 100 * SpotPrice`
- **Call GEX:** Positivo (MM está comprado no papel para cada alta, suprimindo volatilidade).
- **Put GEX:** Negativo (MM precisa vender conforme o preço cai, acelerando o movimento).

## 📄 Estrutura Necessária da Planilha (.xlsx ou .csv)
O importador é inteligente, mas para melhores resultados utilize estas colunas:
| Cabeçalho | Descrição |
| :--- | :--- |
| `strike` | O preço de exercício da opção. |
| `type` | Deve conter 'CALL' ou 'PUT' (ou tipo). |
| `gamma` | O Gamma da opção (0.00x). |
| `oi` | Open Interest (Contratos em aberto). |

## 🛠️ Solução de Problemas
Se a aplicação travar em "Iniciando Kernel":
1. Limpe o cache do navegador (`Ctrl + F5`).
2. Verifique o console (`F12`). O erro `Unexpected token ','` foi corrigido nesta versão através da simplificação do `importmap` e uso do bundle nativo.
3. Se o gráfico não aparecer, verifique se a coluna `strike` da sua planilha contém números válidos.

---
*Aviso: Esta é uma ferramenta de suporte à decisão. Não constitui recomendação financeira.*
