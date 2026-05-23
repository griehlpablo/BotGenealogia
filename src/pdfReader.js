const fs = require('fs/promises');
const config = require('./config');
const { callGeminiGenerateContent } = require('./geminiClient');
const { normalizeSearch } = require('./validators');

const PDF_SYSTEM_PROMPT = `Aja como um investigador genealogico. Analise este documento/grafico em PDF. Identifique as pontas soltas na arvore (pessoas sem pais conhecidos, casais onde falta o conjuge, ou individuos sem datas de nascimento/obito). Retorne ESTRITAMENTE um array JSON contendo objetos com o seguinte formato exato para cada pessoa a investigar: { "site": "familysearch", "givenName": "Nome", "surname": "Sobrenome", "place": "Local provavel", "birthYear": 1900, "birthYearTolerance": 5, "childrenBirthYears": [], "reason": "Motivo da pesquisa" }. Nao devolva Markdown.`;

function cleanJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonArray(text) {
  const cleaned = cleanJsonText(text);
  if (!cleaned) return [];

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

async function analyzeTreePdf(filePath) {
  const pdfBuffer = await fs.readFile(filePath);
  const base64String = pdfBuffer.toString('base64');

  const { data } = await callGeminiGenerateContent({
    taskLabel: 'analise-pdf',
    preferredModel: config.ai.geminiPdfModel || config.ai.geminiModel || 'gemini-1.5-flash-latest',
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
  });

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJsonArray(text).map(normalizeSearch);
}

module.exports = {
  analyzeTreePdf
};
