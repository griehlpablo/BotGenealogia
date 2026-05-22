const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

const SYSTEM_PROMPT = `Analise este texto extraido de um acervo genealogico.
Identifique:
1) Possiveis pais
2) Filhos
3) Variacoes do sobrenome
4) Locais de registro
5) Datas ou janelas temporais relevantes
6) Nivel de confianca e justificativa curta
Formate a resposta exclusivamente como JSON estruturado, sem markdown.`;

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

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      return {
        parseError: error.message,
        raw: trimmed.slice(0, 4000)
      };
    }
  }
}

async function analyzeWithOpenAI(payload) {
  if (!config.ai.openaiApiKey) {
    return emptyAnalysis('OPENAI_API_KEY nao configurada.');
  }

  const client = new OpenAI({ apiKey: config.ai.openaiApiKey });
  const response = await client.chat.completions.create({
    model: config.ai.openaiModel,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload, null, 2) }
    ]
  });

  return extractJson(response.choices?.[0]?.message?.content);
}

async function analyzeWithGemini(payload) {
  if (!config.ai.geminiApiKey) {
    return emptyAnalysis('GEMINI_API_KEY nao configurada.');
  }

  const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: config.ai.geminiModel,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  const result = await model.generateContent([
    SYSTEM_PROMPT,
    JSON.stringify(payload, null, 2)
  ]);

  return extractJson(result.response.text());
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
