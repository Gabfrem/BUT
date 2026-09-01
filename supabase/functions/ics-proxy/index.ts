// Edge Function « ics-proxy »
// ---------------------------------------------------------------------------
// Les serveurs d'emploi du temps (ADE, Hyperplanning…) n'envoient pas d'en-tête
// CORS : un navigateur ne peut donc pas lire leur flux ICS directement. Cette
// fonction, elle, tourne côté serveur : elle va chercher le calendrier et le
// renvoie à l'application avec les bons en-têtes.
//
// Déploiement — deux possibilités :
//
//   A) Dashboard Supabase > Edge Functions > Deploy a new function
//      Nom : ics-proxy — puis coller ce fichier.
//
//   B) En ligne de commande :
//      supabase functions deploy ics-proxy
//
// La fonction exige un utilisateur connecté (JWT vérifié par défaut) : elle ne
// peut donc pas servir de relais ouvert à n'importe qui.
//
// Renseigne ensuite l'URL obtenue dans Réglages > Relais ICS :
//   https://<projet>.supabase.co/functions/v1/ics-proxy

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const cible = new URL(req.url).searchParams.get('url');
    if (!cible) {
      return json({ error: "Paramètre « url » manquant." }, 400);
    }

    const u = new URL(cible.replace(/^webcal:\/\//i, 'https://'));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return json({ error: 'Protocole non autorisé.' }, 400);
    }
    // Pas d'accès aux adresses internes.
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(u.hostname)) {
      return json({ error: 'Adresse interdite.' }, 400);
    }

    const amont = await fetch(u.toString(), {
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain, */*', 'User-Agent': 'carnet-ics-proxy' }
    });

    if (!amont.ok) {
      return json({ error: `Le serveur distant a répondu ${amont.status}.` }, 502);
    }

    const texte = await amont.text();
    if (!texte.includes('BEGIN:VCALENDAR')) {
      return json({ error: "La réponse n'est pas un calendrier ICS." }, 422);
    }

    return new Response(texte, {
      headers: {
        ...CORS,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=900'   // 15 min
      }
    });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(corps: unknown, status: number) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
