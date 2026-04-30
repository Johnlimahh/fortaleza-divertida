export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // ===== Validação =====
  const { humor, sentir, activities } = req.body || {};

  if (!humor || !sentir || !Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  // ===== API KEY =====
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada' });
  }

  // ===== Prompt =====
  const prompt = `
Você é um especialista em lazer e entretenimento em Fortaleza, Ceará, Brasil.

Perfil do usuário:
- Humor atual: ${humor}
- Como quer se sentir: ${sentir}
- Atividades de interesse: ${activities.join(', ')}

Liste OS 4 MELHORES lugares reais em Fortaleza que combinem com esse perfil.

Responda SOMENTE com JSON válido:
{
  "titulo": "frase curta (máx 6 palavras)",
  "subtitulo": "frase curta contextual",
  "lugares": [
    {
      "nome": "Nome real do lugar",
      "tipo": "Categoria",
      "icone": "emoji",
      "nota": 4.6,
      "descricao": "2 frases explicativas.",
      "tags": ["tag1","tag2"],
      "destaque": true
    }
  ]
}

Apenas o primeiro lugar tem destaque true.
`;

  try {
    const response = await fetch(
       `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1200
          }
        })
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Erro Gemini:', responseData);

      return res.status(response.status).json({
        error:
          responseData?.error?.message ||
          'Erro ao consultar a API do Gemini'
      });
    }

    const rawText =
      responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return res.status(500).json({
        error: 'Resposta vazia da IA'
      });
    }

    // Remove markdown fences se vier ```json
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('Resposta não JSON:', cleaned);

      return res.status(500).json({
        error: 'A IA retornou formato inválido'
      });
    }

    const parsed = JSON.parse(
      cleaned.slice(jsonStart, jsonEnd + 1)
    );

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro interno:', err);

    return res.status(500).json({
      error: 'Erro interno no servidor'
    });
  }
}
