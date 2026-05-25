const OpenAI = require('openai');
const config = require('./config');
const { normalizeAiAnalysis, emptyAiAnalysis } = require('./validators');

const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyCgRu3vGDRiZX_TjGfyJGewPU5RxLo3Bs0";
const model = 'gemini-flash-latest';

const SYSTEM_PROMPT = `Voce e um detetive genealogico especializado em analisar texto extraido de acervos, registros civis, paroquiais, jornais, inventarios, obituarios e documentos historicos.

Extraia apenas informacoes sustentadas pelo texto recebido. Nao invente nomes, datas, locais, links ou parentescos. Sempre que sugerir relacao familiar, inclua evidenceText com o trecho ou resumo fiel da evidencia. Se o texto bruto for ruim, generico ou sem registros uteis, retorne arrays vazios, confidence "low" e reasoning curto.

Retorne somente JSON valido, sem Markdown, sem blocos de codigo e sem texto fora do JSON.

O JSON deve seguir exatamente este formato:
{
  "matches": [
    {
      "personName": "",
      "matchedSurnames": [],
      "birth": {
        "date": "",
        "place": ""
      },
      "death": {
        "date": "",
        "place": ""
      },
      "relationships": [
        {
          "type": "father|mother|spouse|child|sibling|other",
          "name": "",
          "evidenceText": ""
        }
      ],
      "sourceLinks": [],
      "confidenceScore": 0,
      "confidenceLabel": "low|medium|high",
      "reasoning": "",
      "warnings": []
    }
  ],
  "possibleParents": [],
  "children": [],
  "surnameVariations": [],
  "recordPlaces": [],
  "relevantDates": [],
  "nextSearchSuggestions": [],
  "confidence": "low|medium|high",
  "reasoning": ""
}

confidenceScore deve ser um numero de 0 a 100. confidenceLabel deve ser coerente com a pontuacao: 0-39 low, 40-74 medium, 75-100 high.`;

function cleanJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJson(text) {
  const cleaned = cleanJsonText(text);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(cleanJsonText(match[0]));
    } catch (error) {
      return {
        parseError: error.message,
        raw: cleaned.slice(0, 4000)
      };
    }
  }
}

async function analyzeWithOpenAI(payload) {
  if (!config.ai.openaiApiKey) {
    return emptyAiAnalysis('OPENAI_API_KEY nao configurada.');
  }

  const client = new OpenAI({ apiKey: config.ai.openaiApiKey });
  const response = await client.chat.completions.create({
    model: config.ai.openaiModel,
    temperature: 0.0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ]
  });

  return normalizeAiAnalysis(extractJson(response.choices?.[0]?.message?.content));
}

async function analyzeWithGemini(payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT + "\n\nDados para análise:\n" + JSON.stringify(payload, null, 2) }
          ]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${data.error?.message || 'Erro desconhecido'}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeAiAnalysis(extractJson(text));
}

async function analyzeGenealogyText(payload) {
  try {
    if (config.ai.provider === 'openai') {
      return await analyzeWithOpenAI(payload);
    }
    if (config.ai.provider === 'gemini') {
      return await analyzeWithGemini(payload);
    }
    return emptyAiAnalysis(`AI_PROVIDER invalido: ${config.ai.provider}`);
  } catch (error) {
    return emptyAiAnalysis(`Falha ao analisar com IA: ${error.message}`);
  }
}

module.exports = {
  analyzeGenealogyText,
  SYSTEM_PROMPT
};
