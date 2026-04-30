export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader(
    'Access-Control-Allow-Origin',
    process.env.ALLOWED_ORIGIN || '*'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  // ===== Validação de dados =====
  const { humor, sentir, activities } = req.body || {};

  if (!humor || !sentir || !Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({
      error: 'Dados incompletos'
    });
  }

  // ===== API KEY =====
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Chave de API do Gemini não configurada no servidor'
    });
  }

  // ===== Prompt =====
  const prompt = `
Você é um especialista em lazer e entretenimento em Fortaleza, Ceará, Brasil.

Perfil do usuário:
- Humor atual: ${humor}
- Como quer se sentir: ${sentir}
- Atividades de interesse: ${activities.join(', ')}

Com base no seu conhecimento local, liste OS 4 MELHORES lugares reais e específicos em Fortaleza
que combinem com esse perfil para visitar hoje ou em um dia comum.

Responda SOMENTE com JSON válido, sem explicações extras, sem blocos de código:

{
  "titulo": "frase curta personalizada (máx 6 palavras)",
  "subtitulo": "frase curta explicativa (1 linha)",
  "lugares": [
    {
      "nome": "Nome real do lugar em Fortaleza",
      "tipo": "categoria (ex: Praia, Bar, Show, Parque)",
      "icone": "emoji único",
      "nota": 4.5,
      "descricao": "2 frases explicando por que combina com o perfil.",
      "tags": ["tag1", "tag2", "tag3"],
      "destaque": true
    }
  ]
}

Apenas o PRIMEIRO lugar deve ter "destaque": true.
Os demais devem ter false.
`;

  try {
    // ===== Chamada ao Gemini =====
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
            maxOutputTokens: 1200,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err.error?.message || 'Erro na API do Gemini'
      });
    }

    // ===== Processamento da resposta =====
    const data = await response.json();

    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return res.status(500).json({
        error: 'Resposta vazia da IA'
      });
    }

    // Remove possíveis blocos ```json
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(500).json({
        error: 'Formato inválido retornado pela IA'
      });
    }

    const jsonString = cleaned.slice(start, end + 1);

    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (e) {
      console.error('Erro ao fazer parse do JSON:', jsonString);
      return res.status(500).json({
        error: 'Erro ao interpretar resposta da IA'
      });
    }

    // ===== Sucesso =====
    return res.status(200).json(result);

  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({
      error: 'Erro interno no servidor'
    });
  }
}
