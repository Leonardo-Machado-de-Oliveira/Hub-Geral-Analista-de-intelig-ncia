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
