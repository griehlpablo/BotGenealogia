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
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
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
