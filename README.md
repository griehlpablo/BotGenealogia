# BotGenealogia

Motor local em Node.js para deducao temporal, busca genealogica com Puppeteer Stealth e analise dos textos extraidos por IA.

## Uso rapido

1. Copie `.env.example` para `.env` e preencha `GEMINI_API_KEY` ou `OPENAI_API_KEY`.
2. Ajuste `data/input.json` com os sobrenomes, nomes, locais e pistas conhecidas.
3. Execute:

```bash
npm start
```

Na primeira execucao, se nao houver cookies em `sessions/`, o navegador abre a tela de login do site. Voce pode entrar manualmente; depois o bot salva os cookies em JSON para as proximas execucoes.

## Entrada

Cada item em `data/input.json` aceita:

- `site`: `familysearch` ou `myheritage`
- `givenName` e `surname`
- `place`
- `birthYearRange`: quando voce ja sabe a janela
- `birthYear` e `birthYearTolerance`: quando sabe um ano aproximado
- `childrenBirthYears` e `knownSpouseBirthYear`: para deduzir janela de nascimento da mae

## Saida

O programa imprime detalhes no console e gera um HTML em `output/` com:

- nome pesquisado
- janela temporal calculada
- hipoteses estruturadas da IA
- links extraidos para verificacao manual
- texto bruto usado na analise

## Observacoes

Use contas e sites respeitando termos de uso, limites de acesso e privacidade dos registros. O bot foi configurado para operar devagar, reutilizar sessao e reduzir logins repetidos.
