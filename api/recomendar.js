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

  const mapaAtividades = {
    'festa e balada': 'casas noturnas, baladas, clubs, festas, eventos noturnos como Dragão do Mar, Route 66, Kosmika, Club 26, Órbita, Aquarius',
    'show de música ao vivo': 'casas de show, bares com banda ao vivo, eventos musicais como Estação das Artes, Mercado dos Pinhões, Cais Bar, Anfiteatro do Dragão do Mar',
    'praia e mar': 'praias, barracas de praia, esportes aquáticos como Praia do Futuro, Praia de Iracema, Meireles, Mucuripe, Náutico',
    'reggae': 'reggae clubs, festas de reggae, bares com reggae ao vivo em Fortaleza',
    'gastronomia e restaurantes': 'restaurantes, botecos, food parks como Mercado dos Pinhões, Beco da Poeira, Coco Bambu, restaurantes da Varjota e Aldeota',
    'cinema e filmes': 'cinemas, cinematecas como Cineteatro São Luiz, UCI, Cinépolis, Cinemark Shopping',
    'teatro': 'teatros, espetáculos, peças como Teatro José de Alencar, Cineteatro São Luiz, Teatro Celina Queiroz, Teatro Carlos Câmara',
    'esportes e atividade física': 'quadras, campos, esportes na praia, circuitos de corrida, academia ao ar livre',
    'parque de diversões': 'parques, atrações família como Beach Park, Parque Rio Branco, Parque do Cocó',
    'kart e velocidade': 'kartódromos em Fortaleza',
    'boliche': 'boliche como Boliche Boulevard, Boliche Iguatemi',
  };

  const tiposEsperados = activities.map(a => mapaAtividades[a] || a).join('\n- ');

  let contextoReal = '';
  if (braveKey) {
    try {
      const queries = [
        `site:viverfortal.com.br agenda eventos ${mesAno}`,
        `site:fortaleza.ce.gov.br agenda cultural eventos ${mesAno}`,
        `site:opovo.com.br agenda Fortaleza ${mesAno} ${activities.join(' ')}`,
        `site:diariodonordeste.com.br eventos shows Fortaleza ${mesAno}`,
        `site:sympla.com.br eventos Fortaleza ${mesAno} ${activities.join(' ')}`,
        `${activities.join(' ')} Fortaleza CE agenda ${mesAno} ingressos`,
      ];

      const buscas = await Promise.all(queries.map(q =>
        fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&lang=pt&country=BR&freshness=pm`, {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey }
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      ));

      const resultados = buscas
        .filter(Boolean)
        .flatMap(b => b.web?.results || [])
        .slice(0, 20)
        .map(r => `FONTE: ${r.url}\nTÍTULO: ${r.title}\nDESCRIÇÃO: ${r.description}`)
        .join('\n---\n');

      if (resultados) contextoReal = `\n\n=== DADOS REAIS DA INTERNET (viverfortal.com.br, prefeitura, O Povo, Diário do Nordeste, Sympla) ===\n${resultados}\n=== FIM DOS DADOS ===`;
    } catch (e) {
      console.error('Brave error:', e);
    }
  }

  const prompt = `Você é um guia local ESPECIALISTA e MORADOR de Fortaleza, Ceará, Brasil. Conhece profundamente cada bairro, bar, restaurante, praia, show, balada e evento da cidade.

Hoje é ${hoje}.

PERFIL DO USUÁRIO:
- Humor atual: ${humor}
- Quer se sentir: ${sentir}
- Tipos de programa desejados: ${activities.join(', ')}

TIPOS DE LUGARES QUE DEVEM APARECER:
- ${tiposEsperados}
${contextoReal}

SUA TAREFA:
Indique EXATAMENTE 10 lugares ou eventos reais em Fortaleza-CE que correspondam DIRETAMENTE aos interesses acima. Priorize eventos e informações encontrados nos dados reais acima, especialmente do viverfortal.com.br e da prefeitura de Fortaleza.

REGRAS ABSOLUTAS:
1. TODOS os 10 lugares devem ser em Fortaleza-CE
2. Combine EXATAMENTE o lugar com o interesse:
   - Festa/balada → clubs e baladas APENAS (Dragão do Mar, Route 66, Kosmika, Club 26, Órbita, etc). NUNCA teatros ou museus
   - Show ao vivo → casas de show APENAS. NUNCA baladas ou teatros
   - Teatro → teatros e espetáculos APENAS. NUNCA baladas ou shows
   - Praia → praias e barracas APENAS. NUNCA shoppings ou clubs
   - Gastronomia → restaurantes e botecos APENAS
   - Cinema → cinemas APENAS
   - Misture categorias SOMENTE se o usuário selecionou múltiplas atividades
3. Nomes REAIS e COMPLETOS dos lugares
4. Varie os BAIRROS: Meireles, Aldeota, Varjota, Praia de Iracema, Mucuripe, Benfica, Centro, Messejana
5. Varie as categorias dentro do interesse — não repita o mesmo tipo
6. Priorize eventos com data real encontrados nos dados acima
7. O primeiro lugar é o DESTAQUE (melhor recomendação), os outros 9 são secundários
8. Notas baseadas em avaliações reais do Google Maps

Responda SOMENTE com JSON válido, sem texto antes ou depois:
{
  "titulo": "frase criativa com o humor (máx 6 palavras)",
  "subtitulo": "frase com o dia e contexto",
  "lugares": [
    {
      "nome": "Nome completo real do lugar em Fortaleza",
      "tipo": "categoria específica",
      "icone": "emoji",
      "nota": 4.3,
      "descricao": "Frase 1: o que torna esse lugar único em Fortaleza. Frase 2: por que combina com quem está ${humor} e quer ${sentir}.",
      "tags": ["Bairro", "faixa de preço", "horário ou dia"],
      "destaque": false
    }
  ]
}
O primeiro lugar tem destaque true, os outros 9 têm destaque false.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista local em Fortaleza-CE com conhecimento profundo de todos os estabelecimentos e eventos da cidade.
REGRA PRINCIPAL: combine EXATAMENTE o lugar com o interesse do usuário.
- Festa/balada → SOMENTE clubs e baladas (Dragão do Mar, Route 66, Kosmika, Club 26, Órbita, Aquarius, Siará Hall)
- Show ao vivo → SOMENTE casas de show (Estação das Artes, Mercado dos Pinhões, Cais Bar, Siará Hall)
- Teatro → SOMENTE teatros (Teatro José de Alencar, Cineteatro São Luiz, Teatro Celina Queiroz, Teatro Carlos Câmara)
- Praia → SOMENTE praias e barracas (Praia do Futuro, Iracema, Meireles, Mucuripe, Náutico)
- Gastronomia → SOMENTE restaurantes e botecos (Varjota, Aldeota, Benfica, Mucuripe)
- Cinema → SOMENTE cinemas (UCI, Cinépolis, Cinemark, Cineteatro São Luiz)
- Reggae → SOMENTE festas e bares de reggae em Fortaleza
- Esportes → SOMENTE locais esportivos, quadras, praias para esporte
NUNCA misture categorias se o usuário pediu apenas uma atividade.
Priorize sempre dados reais e recentes encontrados nas fontes fornecidas.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 3500
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
