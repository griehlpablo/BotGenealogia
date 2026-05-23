const config = require('./config');

const GEMINI_KEY = "AIzaSyBhPMjseM7g8ZMzZa5j1l_rPGfVsX6Bchs";
// const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

const SYSTEM_PROMPT = `Voce e um detetive genealogico especializado em analisar texto extraido de acervos, registros civis, paroquiais, jornais, inventarios, obituarios e documentos historicos.

Sua tarefa e extrair apenas pistas genealogicas sustentadas pelo texto recebido. Nao invente nomes, datas, locais ou relacoes familiares. Quando houver incerteza, registre apenas a pista plausivel e explique brevemente a cautela no campo reasoning.

Contrato de resposta obrigatorio:
- Retorne somente um JSON valido.
- O JSON deve conter exatamente estas chaves:
  - possibleParents: array de strings
  - children: array de strings
  - surnameVariations: array de strings
  - recordPlaces: array de strings
  - relevantDates: array de strings
  - confidence: string
  - reasoning: string curta
- Use arrays vazios quando uma categoria nao tiver evidencias.
- confidence deve ser uma string curta como "low", "medium" ou "high".
- reasoning deve ser curto, objetivo e baseado nas evidencias do texto.

Regra critica: NAO inclua blocos de codigo markdown (como \`\`\`json) e nao adicione texto fora do JSON.`;

function emptyAnalysis(reason) {
  return {
    possibleParents: [],
    children: [],
    surnameVariations: [],
    recordPlaces: [],
    relevantDates: [],
    confidence: 'low',
    reasoning: reason
  };
}

function cleanJsonText(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJson(text) {
  if (!text) return null;

  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const jsonCandidate = cleanJsonText(match[0]);

    try {
      return JSON.parse(jsonCandidate);
    } catch (error) {
      return {
        parseError: error.message,
        raw: cleaned.slice(0, 4000)
      };
    }
  }
}

async function analyzeWithOpenAI(payload) {
  if (!OPENAI_KEY) {
    return emptyAnalysis('OPENAI_KEY nao configurada.');
  }

  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const response = await client.chat.completions.create({
    model: config.ai.openaiModel,
    temperature: 0.0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ]
  });

  return extractJson(response.choices?.[0]?.message?.content);
}

async function analyzeWithGemini(payload) {
  if (!GEMINI_KEY) {
    return emptyAnalysis('GEMINI_KEY nao configurada.');
  }

  const model = config.ai.geminiModel || 'gemini-1.5-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          { text: SYSTEM_PROMPT }
        ]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: JSON.stringify(payload, null, 2) }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json'
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.error?.message || response.statusText || 'Erro desconhecido na API Gemini.';
    throw new Error(`Gemini API ${response.status}: ${message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJson(text);
}

async function analyzeGenealogyText(payload) {
  try {
    if (config.ai.provider === 'openai') {
      return await analyzeWithOpenAI(payload);
    }
    if (config.ai.provider === 'gemini') {
      return await analyzeWithGemini(payload);
    }
    return emptyAnalysis(`AI_PROVIDER invalido: ${config.ai.provider}`);
  } catch (error) {
    return emptyAnalysis(`Falha ao analisar com IA: ${error.message}`);
  }
}

module.exports = {
  analyzeGenealogyText,
  SYSTEM_PROMPT
};
