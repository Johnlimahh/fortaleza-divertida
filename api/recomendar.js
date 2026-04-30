export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { humor, sentir, activities } = req.body || {};
  if (!humor || !sentir || !activities?.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada' });
  }

  const prompt = `Você é um especialista em lazer e entretenimento em Fortaleza, Ceará, Brasil.
  ...
  Apenas o primeiro lugar deve ter destaque true, os demais false.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err.error?.message || 'Erro na API do Gemini'
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) {
      return res.status(500).json({ error: 'Resposta inválida da IA' });
    }

    const result = JSON.parse(clean.slice(s, e + 1));
    return res.status(200).json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
}
