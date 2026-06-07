export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { humor, sentir, activities } = req.body || {};
  if (!humor || !sentir || !Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

  // Busca em tempo real com Brave Search
  let contextoReal = '';
  if (braveKey) {
    try {
      const query = `eventos agenda ${activities.join(' ')} Fortaleza Ceará ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
      const braveRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&lang=pt&country=BR`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey }
      });
      if (braveRes.ok) {
        const braveData = await braveRes.json();
        const resultados = (braveData.web?.results || []).slice(0, 6).map(r => `- ${r.title}: ${r.description}`).join('\n');
        contextoReal = `\n\nDADOS REAIS DA INTERNET (use para embasar suas recomendações):\n${resultados}`;
      }
    } catch (e) {
      console.error('Brave Search error:', e);
    }
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `Você é um especialista em lazer e entretenimento em Fortaleza, Ceará, Brasil.
Hoje é ${hoje}.

Perfil do usuário:
- Humor atual: ${humor}
- Como quer se sentir: ${sentir}
- Atividades de interesse: ${activities.join(', ')}
${contextoReal}

Com base no perfil e nos dados reais acima, liste os 4 MELHORES lugares ou eventos REAIS e ATUAIS em Fortaleza para hoje. Priorize eventos da semana atual. Inclua nota baseada em avaliações reais do Google Maps quando possível. Seja específico com nomes reais de lugares em Fortaleza.

Responda SOMENTE com JSON válido, sem texto antes ou depois, sem blocos de código:
{
  "titulo": "frase curta personalizada (máx 6 palavras)",
  "subtitulo": "frase contextual com o dia ou período",
  "lugares": [
    {
      "nome": "Nome real do lugar ou evento em Fortaleza",
      "tipo": "Categoria (ex: Praia, Show, Bar, Esporte, Festival)",
      "icone": "emoji",
      "nota": 4.6,
      "descricao": "2 frases específicas sobre o lugar/evento e por que combina com o perfil.",
      "tags": ["tag1","tag2","tag3"],
      "destaque": true
    }
  ]
}
Apenas o primeiro lugar tem destaque true, os demais false.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Erro na API do Groq' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1) return res.status(500).json({ error: 'Formato de resposta inválido' });

    const result = JSON.parse(clean.slice(s, e + 1));
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Erro interno no servidor' });
  }
}
