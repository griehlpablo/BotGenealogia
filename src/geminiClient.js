const config = require('./config');

function uniqueModels(models) {
  const seen = new Set();
  return models
    .map((model) => String(model || '').trim())
    .filter(Boolean)
    .filter((model) => {
      if (seen.has(model)) return false;
      seen.add(model);
      return true;
    });
}

function shouldTryNextModel(status, message) {
  if ([404, 429, 503].includes(status)) return true;
  return /model|not found|not supported|unavailable|overloaded|quota/i.test(message || '');
}

async function parseGeminiResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    return { rawText: text };
  }
}

async function callGeminiGenerateContent({
  systemInstruction,
  contents,
  generationConfig,
  preferredModel,
  taskLabel = 'gemini'
}) {
  if (!config.ai.geminiApiKey) {
    throw new Error('GEMINI_API_KEY nao configurada.');
  }

  const models = uniqueModels([
    preferredModel,
    config.ai.geminiModel,
    ...config.ai.geminiFallbackModels,
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-pro'
  ]);

  const attempts = [];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiApiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig
        })
      });

      const data = await parseGeminiResponse(response);

      if (response.ok) {
        console.log(`[gemini] ${taskLabel}: usando modelo ${model}`);
        return { data, model };
      }

      const message = data.error?.message || data.rawText || response.statusText || 'Erro desconhecido na API Gemini.';
      attempts.push(`${model}: HTTP ${response.status} - ${message}`);

      if (!shouldTryNextModel(response.status, message)) {
        throw new Error(`Gemini ${taskLabel} falhou com ${model}: ${message}`);
      }

      console.warn(`[gemini] ${taskLabel}: modelo ${model} indisponivel (${response.status}); tentando fallback.`);
    } catch (error) {
      attempts.push(`${model}: ${error.message}`);
      if (!shouldTryNextModel(503, error.message)) {
        throw error;
      }
      console.warn(`[gemini] ${taskLabel}: falha com ${model}; tentando fallback. ${error.message}`);
    }
  }

  throw new Error(`Gemini ${taskLabel}: todos os modelos falharam. Tentativas: ${attempts.join(' | ')}`);
}

module.exports = {
  callGeminiGenerateContent
};
