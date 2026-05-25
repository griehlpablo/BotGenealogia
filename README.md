# BotGenealogia

Motor local em Node.js CommonJS para deducao temporal genealogica, busca assistida em acervos, analise por IA e geracao de relatorios HTML/JSON.

## Arquitetura

- `index.js`: orquestrador principal.
- `src/config.js`: configuracao por variaveis de ambiente.
- `src/logic.js`: deducao temporal e janelas genealogicas.
- `src/validators.js`: normalizacao segura de buscas e respostas da IA.
- `src/scoring.js`: pontuacao objetiva complementar das hipoteses.
- `src/scraper.js`: Puppeteer, sessoes por cookies, delays, estados de pagina e debug.
- `src/siteExtractors/`: extratores por site com fallback generico.
- `src/session.js`: salvar e carregar cookies locais.
- `src/ai.js`: analise de texto genealogico via Gemini ou OpenAI.
- `src/pdfReader.js`: leitura de PDFs locais com Gemini para sugerir novas buscas.
- `src/report.js`: relatorio HTML e JSON completo em `output/`.

## Configuracao

Copie `.env.example` para `.env` e preencha apenas o que for necessario:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash-latest
GEMINI_PDF_MODEL=gemini-1.5-flash-latest
GEMINI_FALLBACK_MODELS=gemini-1.5-flash-latest,gemini-1.5-flash,gemini-pro
```

Para OpenAI:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Credenciais de FamilySearch/MyHeritage sao opcionais. Se ficarem vazias, o navegador abre para login manual e os cookies sao salvos localmente em `sessions/`.

## Como rodar

```bash
npm install
npm run doctor
npm start
```

`npm run doctor` apenas carrega os modulos principais para detectar erros de importacao/configuracao local.

## Teste isolado do FamilySearch

Para validar apenas o scraper do FamilySearch, sem IA e sem leitura de PDFs:

```bash
npm run test:familysearch
```

Quando a janela abrir, faça login manualmente no FamilySearch. Depois que a pagina carregar, aguarde: o bot salvará os cookies em `sessions/` automaticamente.

Rode `npm run test:familysearch` de novo para testar o reaproveitamento da sessao salva.

Se aparecer Error 15 no bot, mas nao no Chrome normal:

- apague `sessions/familysearch-cookies.json`;
- teste de novo em modo visivel;
- se persistir, use um perfil persistente proprio do projeto com `PUPPETEER_USER_DATA_DIR=./chrome-profile`;
- nao use VPN/proxy e nao use o perfil principal do Chrome aberto ao mesmo tempo.

## FamilySearch Error 15 e modo manual

A partir do modo manual, o bot nao tenta contornar Error 15 nem automatizar o login no FamilySearch. Ele gera a URL da busca e voce abre no Chrome normal.

1. Gere as URLs de busca FamilySearch a partir de `data/input.json`:

```bash
npm run urls:familysearch
```

2. Gere URLs apenas a partir de PDFs em `data/pdfs`:

```bash
npm run urls:familysearch:pdf
```

3. Gere URLs a partir de ambos `data/input.json` e `data/pdfs`:

```bash
npm run urls:familysearch:all
```

Cada URL agora inclui a origem do registro, por exemplo:

```text
[input.json] Maria Silva: https://...
[pdf:arquivo.pdf] Giacoma Cologni: https://...
```

4. Abra cada URL no Chrome normal.

5. Copie o texto da pagina de resultados ou salve o HTML.

6. Coloque os arquivos em:

```text
data/manual/
```

Exemplos:

```text
data/manual/maria-silva.txt
data/manual/giacoma-cologni.html
```

7. Rode a analise manual:

```bash
npm run analyze:manual
```

8. Verifique o relatorio em `output/`.

O bot nao tenta mascarar fingerprint, proxy, captchas ou outros bloqueios. Ele aceita apenas o modo manual para FamilySearch.

## Entrada manual

Edite `data/input.json`:

```json
{
  "searches": [
    {
      "site": "familysearch",
      "givenName": "Maria",
      "surname": "Silva",
      "place": "Sao Paulo, Brasil",
      "role": "mother",
      "childrenBirthYears": [1920, 1924]
    }
  ]
}
```

Mesmo sem buscas manuais, `data/input.json` precisa conter JSON valido. O minimo e:

```json
{
  "searches": []
}
```

Se o arquivo estiver ausente, vazio ou invalido, o programa imprime um aviso claro e continua com `searches: []`. Use `data/input.example.json` como referencia.

Campos uteis:

- `site`: `familysearch`, `myheritage`, `google` ou `web`.
- `givenName`, `surname`, `place`.
- `birthYear` e `birthYearTolerance`.
- `birthYearRange`: `{ "from": 1880, "to": 1890 }`.
- `childrenBirthYears`, `knownSpouseBirthYear`.
- `role` ou `targetRelation`: `mother`, `father`, `spouse`, `child`, `unknown`.

## PDFs locais

Coloque graficos de arvore genealogica ou documentos digitalizados em:

```text
data/pdfs/
```

Arquivos `.pdf` nessa pasta sao enviados ao Gemini como `application/pdf`. A IA sugere novas buscas, que sao normalizadas e adicionadas dinamicamente ao fluxo antes do scraping.

Por privacidade, PDFs em `data/pdfs/*.pdf` ficam ignorados pelo Git.

## Saida

O bot gera arquivos em `output/`:

- `relatorio-*.html`: relatorio navegavel.
- `relatorio-*.json`: resultado completo para auditoria ou processamento posterior.
- `output/debug/`: screenshots em erro. Se `DEBUG_SAVE_HTML=true`, tambem salva HTML bruto para diagnostico.

O relatorio inclui resumo, erros, confianca, pontuacao objetiva, avisos, evidencias textuais, links extraidos e texto bruto em `<details>`.

## Uso responsavel

Use o bot respeitando termos de uso, limites de acesso e privacidade dos sites consultados. O scraper opera com delays randômicos, reaproveita sessao por cookies e nao tenta automatizar captcha ou contornar bloqueios. Se houver login, captcha, bloqueio ou sessao expirada, trate manualmente.
