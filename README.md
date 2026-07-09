# Terminal WDO — Painel de operação em nuvem

Painel de day trade para mini dólar (WDO): cotação ao vivo, análise técnica completa
(EMAs, RSI, MACD, Bollinger, ATR, ADX), score de confluência, pivôs + Camarilla + Fibonacci,
gestão de posição com trailing stop, circuit breaker de risco, diário na nuvem (Supabase)
e analista macro por IA (Claude + busca na web).

## Passo a passo do deploy (≈15 min)

### 1. Supabase (diário na nuvem)
1. Em https://supabase.com crie um projeto (ou use um existente).
2. SQL Editor → cole e execute o conteúdo de `supabase/schema.sql`.
3. Settings → API: copie a **URL** e a chave **service_role** (não a anon).

### 2. Anthropic (analista macro IA)
1. Em https://console.anthropic.com crie uma API key (uso pago por consumo;
   cada análise custa centavos).
2. Sem a chave o painel funciona normalmente — só o botão de IA fica desativado.

### 3. Render
1. Suba esta pasta para um repositório no GitHub.
2. No Render: New → Web Service → conecte o repositório (o `render.yaml` já configura tudo).
3. Em Environment, preencha:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
4. Deploy. A URL gerada é seu terminal — abra no Redmi Pad em tela cheia.

### Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev                  # http://localhost:3000
```

## Observações
- Plano free do Render hiberna após inatividade; o primeiro acesso do dia demora ~30 s.
- A tabela `scores` grava o score de confluência a cada 5 min — base para backtesting futuro.
- Nunca exponha a chave service_role no navegador: ela vive só nas variáveis do servidor.
