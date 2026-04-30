// Cache em memória (simples e eficiente)
const cache = new Map();

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

  // 🔑 chave de cache
  const key = JSON.stringify({ humor, sentir, activities });

  // ⚡ verifica cache
  if (cache.has(key)) {
    console.log("CACHE HIT");
    return res.status(200).json(cache.get(key));
  }

  // 🧠 prompt otimizado (menos tokens)
  const prompt = `Você recomenda lugares em Fortaleza.

Perfil:
Humor: ${humor}
Objetivo: ${sentir}
Interesses: ${activities.join(', ')}

Retorne APENAS JSON:

{
 "titulo": "curto",
 "subtitulo": "1 frase",
 "lugares": [
  {
   "nome": "",
   "tipo": "",
   "icone": "",
   "nota": 4.5,
   "descricao": "curta",
   "tags": [],
   "destaque": true
  }
 ]
}
4 lugares. Só o primeiro destaque true.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 350
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

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 🧹 limpeza robusta
    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start === -1 || end === -1) {
      console.error("Resposta inválida:", clean);
      return res.status(500).json({ error: 'Formato de resposta inválido' });
    }

    let result;
    try {
      result = JSON.parse(clean.slice(start, end + 1));
    } catch (e) {
      console.error("Erro ao parsear JSON:", clean);
      return res.status(500).json({ error: 'Erro ao processar resposta da IA' });
    }

    // 💾 salva no cache
    cache.set(key, result);

    return res.status(200).json(result);

  } catch (err) {
    console.error("Erro interno:", err);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
}
