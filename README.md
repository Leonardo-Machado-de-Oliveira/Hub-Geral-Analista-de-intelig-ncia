# Gerador de Títulos SafeTitulo v2 (Compy direto via CORS)

Aplicação web autossuficiente (HTML + Bootstrap 5 + Font Awesome + JavaScript puro) para criação de pedidos e consulta de títulos/boletos diretamente contra o ERP Safeweb (Compy) a partir do navegador via CORS.

## Arquitetura de Transporte

- **Chamadas diretas do navegador:** Todas as requisições (`ws.Pedido`, `ws.SavePedido`, `ws.Titulo`) são enviadas diretamente pelo navegador com `fetch` para `{endpoint}?domain={domain}&license={license}&neuron={neuron}&user={user}`.
- **Requisitos de rede:** O usuário deve estar na rede corporativa com acesso ao Compy (`erp.safeweb.com.br`) e com uma extensão de CORS habilitada no navegador.
- **Sem proxy / sem simulação:** O servidor Node/Express apenas serve a página, o endpoint `/api/health` e o download do HTML standalone (`/download`). Nenhum dado ou boleto é simulado ou fabricado.
- **Configuração local:** Os parâmetros (`endpoint`, `domain`, `license`, `user`, `timeoutSec`, `confTentativas`, `titTentativas`, `intervaloSec`) ficam salvos no `localStorage` do navegador (`safetitulo_compy_config_v1`).

## Fluxo das 4 Chamadas (`Criar pedido no Compy e buscar título`)

1. **Validação local:** Verifica CPF/CNPJ (dígitos verificadores), valor (> 0, aceitando formato BR `1.234,56`), vencimento entre hoje e +10 dias, `xPed` válido (`[A-Za-z0-9_\-.+]`), `cProd` inteiro > 0, `qCom` > 0, `codigoObjetivo` e `codigoCobranca`.
2. **Pré-checagem (`ws.Pedido`):** Envia `{"xPed":"PED-..."}`.
   - Se o Compy retornar HTTP 400 `"Nenhum pedido encontrado"`, o `xPed` está livre e o fluxo avança.
   - Se o pedido já existir, o fluxo interrompe antes de chamar `ws.SavePedido` para evitar duplicidade.
   - Se houver falha de rede/CORS, HTML inesperado ou erro HTTP, o fluxo interrompe imediatamente.
3. **Criação do pedido (`ws.SavePedido`):** Envia o payload exato para criação síncrona do pedido. Nunca reenvia `ws.SavePedido` automaticamente em retry.
4. **Conferência (`ws.Pedido` com retry):** Consulta o `xPed` até `confTentativas` vezes (intervalo de 2s) para confirmar a gravação real no Compy e comparar `vTot` com o valor enviado.
5. **Consulta do título/boleto (`ws.Titulo` com retry):** Envia `{"numero":"PED-...","cpf":"..."}` (ou `"cnpj"`) até `titTentativas` vezes com intervalo `intervaloSec` enquanto retornar `"Nenhum título encontrado"`. Exibe todos os campos retornados e o link/PDF real do boleto quando disponível.

## Contrato dos Payloads

### `ws.SavePedido`
```json
{
  "pedidoList": [
    {
      "cpf": "86933914020",
      "cpfFaturamento": "86933914020",
      "xPed": "PED-20261113-1234",
      "codigoObjetivo": "C15",
      "faturar": false,
      "prodList": [
        { "cProd": 5010124, "qCom": 1, "vProd": 150 }
      ],
      "dupList": [
        { "dVenc": "16/11/2026", "codigoCobranca": "1", "podeEnviarImediatamente": true }
      ]
    }
  ],
  "sincrono": true
}
```
- Para CNPJ (14 dígitos), usa `"cnpj"` e `"cnpjFaturamento"`.
- `"codigoClassificacao"` é incluído somente quando preenchido.
- `cProd`, `qCom` e `vProd` são números (`Number(valor.toFixed(2))`).
- `dVenc` usa `DD/MM/AAAA` e `codigoCobranca` é string.
- `sincrono` fica sempre na raiz como `true`.

### `ws.Pedido`
```json
{"xPed":"PED-20261113-1234"}
```

### `ws.Titulo`
```json
{"numero":"PED-20261113-1234","cpf":"86933914020"}
```

## Scripts

```bash
npm install
npm run dev
```

---

## Hub de Soluções via API

O hub centraliza operações administrativas integradas ao Compy. Menu principal:

| Seção | Tipo | Descrição |
| --- | --- | --- |
| Gerar boleto / Consultar título / Histórico / Diagnósticos | Monitoramento | Emissão de títulos já existente |
| Alterar valores em massa (`bulk_valor`) | Solução via API | Retificação de valor de vários pedidos |
| Alterar CNPJ em massa (`bulk_cnpj`) | Solução via API | Troca do CNPJ de faturamento de vários pedidos |

### Arquivos novos e alterados

- **Novo** `src/lib/bulkCorrecao.ts`: parser da lista, builders de payload, runner sequencial em lote e geração do log JSON.
- **Novo** `src/components/BulkCorrectionPage.tsx`: tela das duas soluções (mesmo layout das demais telas).
- **Alterados:** `src/types/compy.ts` (`NavSection` com `bulk_valor` e `bulk_cnpj`), `src/components/Sidebar.tsx` (grupo "Soluções via API" e subtítulo do hub), `src/components/TopBar.tsx` (títulos), `src/App.tsx` (renderização da nova página).

### Rotas e endpoints

- **Nenhuma rota nova no servidor Express.** As chamadas seguem o padrão do projeto: o navegador chama o Compy diretamente via `callCompy`, usando `buildCompyUrl(config, neuron)`.
- **Neurons utilizados:**
  - `ws.Pedido` — consulta do pedido (somente em `bulk_valor`).
  - `ws.SavePedido` — retificação de valor (`bulk_valor`) e troca do CNPJ de faturamento (`bulk_cnpj`).
- **Dependências:** nenhuma nova (usa as já existentes em `package.json`).

### Formato de entrada

- `bulk_valor`: uma linha por pedido, `xPed;valor` (ex.: `1011673416;150,00`).
- `bulk_cnpj`: uma linha por pedido, `xPed;CNPJ` (ex.: `1011632133;05054960000158`).
- Separadores aceitos: `;` ou tabulação. Limite de 500 linhas por lote.

### Lógica por operação (conforme logs de referência `disparos-correcao_valor` e `disparos-correcao_cliente`)

1. **Alteração de valor (`correcao:valor`)**, por pedido:
   - `ws.Pedido {xPed}` (consulta). Se falhar, o pedido não é alterado.
   - Monta o `pedidoList[0]` a partir do pedido consultado, com `vTot` = novo valor total, `faturar: false` e `codigoObjetivo: "02"`.
   - Com mais de um item, o total é dividido igualmente entre os itens (`dividirValorEmPartes`), em centavos. O resto vai para os últimos itens. Exemplo: 67,00 em 3 itens → 22,33 / 22,33 / 22,34. Em cada item, `vUnCom` = `vProd` = parcela.
   - `ws.SavePedido {pedidoList:[...], sincrono:true}` (etapa "retificação").
   - Restrição: cada item do pedido deve ter `qCom = 1`. Caso contrário, o pedido é recusado sem envio.
2. **Alteração de CNPJ de faturamento (`correcao:cliente`)**, por pedido:
   - `ws.SavePedido {pedidoList:[{xPed, cnpjFaturamento}], sincrono:true}`, sem consulta prévia (conforme o log de referência).

Execução sequencial, uma chamada por vez. Botão **Parar** interrompe o lote entre itens.

### Log do lote

Ao final, é possível baixar `disparos-<fluxo>-<batchId>.json`, com um registro por chamada no mesmo formato dos arquivos de referência (`flowId`, `batchId`, `itemIndex` (base 0), `itemKey`, `step`, `requestBody`, `responseBody`, `httpStatus`, `durationMs`, `transport`, etc.). O campo `id` é `null`, pois o hub não recebe o id de log do servidor.

### Validação e segurança

- xPed com `[A-Za-z0-9_\-.+]`, sem repetição na lista.
- Valores > 0 (aceita formato BR `1.234,56`).
- CNPJ com 14 dígitos e dígito verificador válido.
- A execução só habilita após a confirmação explícita do checkbox.

---

## Venda avulsa de mídias (`midia_avulsa`)

Tela no grupo **Soluções via API** que gera pedido MIDIAAVULSA e boleto para TOKEN, CARTÃO ou LEITORA.

### Arquivos

- **Novo** `src/lib/midiaAvulsa.ts`: catálogo de produtos, numeração MIDIAAVULSA, preços e parâmetros opcionais, payload e validação.
- **Novo** `src/components/MidiaAvulsaPage.tsx`: tela do módulo.
- **Alterados:** `src/App.tsx` (o fluxo de criação virou `runCreateFlowCore(override?)`; sem argumento, a emissão de títulos funciona como antes), `src/types/compy.ts` (`NavSection`/`OperationMode` com `midia_avulsa`, campo `produto` na execução e no histórico), `Sidebar.tsx`, `TopBar.tsx`, `HistoryPage.tsx`, `OverviewPage.tsx` (rótulos e filtro).
- Sem rota nova no Express e sem dependência nova.

### Composição (regra de negócio, 1 UN por item)

| Produto | Itens (cProd) |
| --- | --- |
| TOKEN | Token (5010231) + Middleware Token (5010302) |
| CARTÃO | Cartão (3689) + Middleware Cartão (5010301) |
| LEITORA | Leitora (501022) |

### Fluxo (reaproveita a emissão de títulos)

1. **Número:** ao abrir a tela, `ws.Pedido` sonda `MIDIAAVULSA<n>` a partir do último número conhecido + 1 (inicial: 35408) e pula os que já existem no Compy. O último número usado fica no `localStorage` (`safetitulo_midia_ultimo_v1`).
2. **Validação local:** número gerado, CPF/CNPJ válido, produto e composição, vencimento entre hoje e +10 dias (mesma regra da emissão de títulos).
3. **Pré-checagem `ws.Pedido`:** se o número tiver sido usado por outra pessoa nesse meio-tempo, o `ws.SavePedido` não é enviado.
4. **`ws.SavePedido`:** cliente (`cnpj`/`cnpjFaturamento` ou `cpf`/`cpfFaturamento`), `xPed`, `prodList` e `dupList` com `dVenc` (dd/mm/aaaa).
5. **Conferência `ws.Pedido`:** lê o `vTot` gravado.
6. **`ws.Titulo`:** busca o boleto.

O resultado vai para o histórico com o modo "Mídia avulsa · PRODUTO".

### Preço, objetivo e cobrança

- **Padrão:** o pedido vai só com `cProd` e `qCom`, e o Compy aplica a própria tabela de preços (como na tela manual). O valor aparece na conferência.
- **Objetivo e cobrança:** via API o Compy não aplica objetivo sozinho (erro "O objetivo para serviço não foi encontrado"). Padrões no código: `codigoObjetivo` = `18` (Prestação de Serviço e-commerce, em teste) e `codigoCobranca` = `1` (boleto Safe2Pay).
- **Configurações** (na própria tela, salvas no navegador): preço unitário por item e troca de `codigoObjetivo`/`codigoCobranca`. Use apenas se a API não preencher sozinha. Os preços só são enviados quando todos os itens do produto estão preenchidos. Nesse caso, o total aparece antes do envio e é comparado com o `vTot` e com o valor do título.

### Limitações conhecidas

- A numeração não tem contador central: dois usuários gerando ao mesmo tempo podem receber o mesmo número. A pré-checagem imediatamente antes do `ws.SavePedido` reduz a janela, mas não a elimina.
- Não há neuron de busca de cliente; o cliente é identificado pelo CPF/CNPJ.
