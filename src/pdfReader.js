const fs = require('fs/promises');
const config = require('./config');

const GEMINI_KEY = process.env.GEMINI_API_KEY || config.ai.geminiApiKey;

const PDF_SYSTEM_PROMPT = `Aja como um investigador genealogico. Analise este documento/grafico em PDF. Identifique as pontas soltas na arvore (pessoas sem pais conhecidos, casais onde falta o conjuge, ou individuos sem datas de nascimento/obito). Retorne ESTRITAMENTE um array JSON contendo objetos com o seguinte formato exato para cada pessoa a investigar: { "site": "familysearch", "givenName": "Nome", "surname": "Sobrenome", "place": "Local provavel", "birthYear": 1900, "birthYearTolerance": 5, "childrenBirthYears": [], "reason": "Motivo da pesquisa" }. Nao devolva Markdown.`;

function cleanJsonText(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonArray(text) {
  if (!text) return [];

  const cleaned = cleanJsonText(text);

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(cleanJsonText(match[0]));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [
        {
          site: 'familysearch',
          givenName: '',
          surname: '',
          place: '',
          birthYear: null,
          birthYearTolerance: 5,
          childrenBirthYears: [],
          reason: `Falha ao interpretar JSON do PDF: ${error.message}`
        }
      ];
    }
  }
}

function normalizeSearch(search) {
  return {
    site: search.site || 'familysearch',
    givenName: search.givenName || '',
    surname: search.surname || '',
    place: search.place || '',
    birthYear: Number.isFinite(Number(search.birthYear)) ? Number(search.birthYear) : undefined,
    birthYearTolerance: Number.isFinite(Number(search.birthYearTolerance))
      ? Number(search.birthYearTolerance)
      : 5,
    childrenBirthYears: Array.isArray(search.childrenBirthYears)
      ? search.childrenBirthYears.filter((year) => Number.isFinite(Number(year))).map(Number)
      : [],
    reason: search.reason || 'Pesquisa sugerida a partir de PDF genealogico.'
  };
}

async function analyzeTreePdf(filePath) {
  if (!GEMINI_KEY) {
    throw new Error('GEMINI_KEY nao configurada.');
  }

  const pdfBuffer = await fs.readFile(filePath);
  const base64String = pdfBuffer.toString('base64');
  const model = 'gemini-1.5-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          { text: PDF_SYSTEM_PROMPT }
        ]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64String
              }
            }
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
    throw new Error(`Gemini PDF API ${response.status}: ${message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJsonArray(text).map(normalizeSearch);
}

module.exports = {
  analyzeTreePdf
};
