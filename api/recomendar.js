export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { humor, sentir, activities } = req.body || {};
  if (!humor || !sentir || !activities?.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada no servidor' });
  }

  const prompt = `Você é um especialista em lazer e entretenimento em Fortaleza, Ceará, Brasil.

Perfil do usuário:
- Humor atual: ${humor}
- Como quer se sentir: ${sentir}
- Atividades de interesse: ${activities.join(', ')}

Liste 4 lugares REAIS e ESPECÍFICOS em Fortaleza que combinem com esse perfil.

Responda SOMENTE com JSON válido, sem texto antes ou depois:
{
  "titulo": "frase curta (máx 6 palavras)",
  "subtitulo": "frase contextual",
  "lugares": [
    {
      "nome": "Nome real",
      "tipo": "categoria",
      "icone": "emoji",
      "nota": 4.5,
      "descricao": "2 frases naturais e específicas",
      "tags": ["tag1","tag2","tag3"],
      "destaque": true
    }
  ]
}
Apenas o primeiro lugar deve ter destaque true.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
           maxOutputTokens: 350,
            temperature: 0.6
          }
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Erro Gemini:", err);
      return res.status(response.status).json({
        error: err.error?.message || 'Erro na API do Gemini'
      });
    }

    const data = await response.json();

    // pega texto da resposta
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // limpa possíveis blocos markdown
    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // extrai JSON válido
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start === -1 || end === -1) {
      console.error("Resposta inválida:", clean);
      return res.status(500).json({ error: 'Formato de resposta inválido' });
    }

    const jsonString = clean.slice(start, end + 1);

    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (e) {
      console.error("Erro ao parsear JSON:", jsonString);
      return res.status(500).json({ error: 'Erro ao processar resposta da IA' });
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error("Erro interno:", err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
}
