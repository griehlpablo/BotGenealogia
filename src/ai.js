const { normalizeAiAnalysis, emptyAiAnalysis } = require('./validators');
const GEMINI_KEY = "AIzaSyBhPMjseM7g8ZMzZa5j1l_rPGfVsX6Bchs";

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

async function analyzeWithGemini(payload) {
  const model = 'gemini-1.5-pro';
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
  return normalizeAiAnalysis(extractJson(text));
}

async function analyzeGenealogyText(payload) {
  try {
    return await analyzeWithGemini(payload);
  } catch (error) {
    return emptyAiAnalysis(`Falha ao analisar com IA: ${error.message}`);
  }
}

module.exports = {
  analyzeGenealogyText,
  SYSTEM_PROMPT
};
