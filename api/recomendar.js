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

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const mesAno = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Múltiplas buscas focadas em Fortaleza
  let contextoReal = '';
  if (braveKey) {
    try {
      const queries = [
        `site:opovo.com.br OR site:diariodonordeste.com.br eventos agenda Fortaleza ${mesAno}`,
        `eventos shows festas Fortaleza Ceará ${mesAno} site:instagram.com OR site:sympla.com.br`,
        `agenda cultural ${activities.join(' ')} Fortaleza ${mesAno}`,
        `bares restaurantes baladas Fortaleza melhores avaliados 2025`
      ];

      const buscas = await Promise.all(queries.map(q =>
        fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&lang=pt&country=BR`, {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey }
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      ));

      const resultados = buscas
        .filter(Boolean)
        .flatMap(b => b.web?.results || [])
        .slice(0, 12)
        .map(r => `- ${r.title}: ${r.description} (${r.url})`)
        .join('\n');

      if (resultados) {
        contextoReal = `\n\nDADOS REAIS COLETADOS DA INTERNET AGORA:\n${resultados}\n\nUSE APENAS LUGARES E EVENTOS QUE APARECEM NESSES DADOS ACIMA. Se não tiver informação suficiente, use apenas lugares REAIS e CONHECIDOS de Fortaleza-CE.`;
      }
    } catch (e) {
      console.error('Brave error:', e);
    }
  }

  const prompt = `Você é um guia local especialista em Fortaleza, Ceará, Brasil. Hoje é ${hoje}.

Perfil do usuário:
- Humor: ${humor}
- Quer se sentir: ${sentir}  
- Interesses: ${activities.join(', ')}
${contextoReal}

REGRAS OBRIGATÓRIAS:
1. SOMENTE lugares e eventos em Fortaleza-CE, Brasil
2. Use NOMES REAIS e COMPLETOS dos estabelecimentos (ex: "Mercado dos Pinhões", "Praia do Futuro", "Beach Park", "Aterrinho da Praia de Iracema")
3. Se encontrou eventos reais nos dados acima, priorize-os
4. Notas baseadas em avaliações reais do Google Maps
5. Tags específicas e úteis (bairro, faixa de preço, horário)
6. NUNCA invente lugares que não existem em Fortaleza

Responda SOMENTE com JSON válido, sem texto antes ou depois:
{
  "titulo": "frase curta personalizada (máx 6 palavras)",
  "subtitulo": "frase com contexto do dia/período",
  "lugares": [
    {
      "nome": "Nome real e completo do lugar em Fortaleza",
      "tipo": "categoria específica (ex: Bar na Praia, Show de Forró, Restaurante Cearense)",
      "icone": "emoji",
      "nota": 4.6,
      "descricao": "2 frases específicas: o que é o lugar/evento + por que combina com o perfil do usuário.",
      "tags": ["bairro ou endereço", "faixa de preço", "horário ou dia"],
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
        temperature: 0.4,
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
