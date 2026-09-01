/* ============================================================================
 *  Configuration de Carnet
 *  ---------------------------------------------------------------------------
 *  Renseigne les deux valeurs ci-dessous, trouvables dans :
 *      Supabase Dashboard > ton projet > Settings > API
 *
 *      supabaseUrl     -> "Project URL"        (https://xxxx.supabase.co)
 *      supabaseAnonKey -> "anon / public key"
 *
 *  La clé "anon" est PUBLIQUE par nature : elle est faite pour vivre dans du
 *  code front. Ce qui protège tes données, c'est la RLS activée dans
 *  sql/01_schema.sql (chaque ligne n'est lisible que par son propriétaire).
 *  Ne mets JAMAIS ici la clé "service_role".
 *
 *  Tu peux aussi laisser ces champs vides : l'application affichera alors un
 *  écran de configuration et gardera les valeurs dans le navigateur.
 * ========================================================================== */
window.CARNET_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  /* Optionnel — URL d'une Edge Function qui relaie l'emploi du temps ICS
     (contourne le blocage CORS d'ADE). Voir supabase/functions/ics-proxy/.
     Exemple : "https://xxxx.supabase.co/functions/v1/ics-proxy"
     Laisse vide : l'app tentera un accès direct puis un relais public. */
  icsProxy: ""
};
