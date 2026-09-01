# Carnet

Une interface web pour scanner ses feuilles de cours avec son téléphone et les
retrouver rangées par matière et par chapitre, depuis l'IUT comme depuis chez soi.

- **Scanner** — photo de la feuille, nettoyage automatique (le papier redevient
  blanc même sous une lampe de travers), recadrage, pages multiples.
- **Ranger** — une pop-up demande la matière et le chapitre juste après le scan.
  Si un cours est en train d'avoir lieu d'après l'emploi du temps, la matière est
  déjà pré-sélectionnée. Un chapitre peut être créé sans quitter la pop-up.
- **Retrouver** — accueil avec l'emploi du temps du jour et les derniers scans ;
  navigation matière → chapitre → feuille ; recherche par titre, mot-clé,
  matière ou chapitre ; favoris ; bac « à ranger » pour ce qui a été scanné vite fait.
- **Partout** — site statique hébergé sur GitHub Pages, données dans ton propre
  projet Supabase, installable comme une application sur le téléphone.

Aucune étape de compilation : pas de Node, pas de `npm install`. Le dépôt tel
quel *est* le site.

---

## Ce qu'il te faut

- Un compte [Supabase](https://supabase.com) (gratuit) — base de données + stockage des images.
- Un compte GitHub (gratuit) — hébergement du site.

Durée d'installation : une quinzaine de minutes, une seule fois.

---

## 1. Créer le projet Supabase

1. [supabase.com](https://supabase.com) → **New project**.
2. Choisis une région proche (*Frankfurt* ou *Paris* si proposée) et note bien le
   mot de passe de la base.
3. Attends la fin de la création (une petite minute).

## 2. Créer les tables

Dans le tableau de bord Supabase : **SQL Editor** → **New query**.

1. Copie tout le contenu de [`sql/01_schema.sql`](sql/01_schema.sql) → **Run**.
2. Nouvelle requête, copie [`sql/02_storage.sql`](sql/02_storage.sql) → **Run**.

Le second script crée le bucket `scans` (privé) et ses règles d'accès. Si
Postgres refuse d'écrire les règles (`must be owner of table objects`), crée-les
à la main depuis **Storage → scans → Policies** en reprenant les expressions
laissées en commentaire dans le fichier.

Ces deux scripts activent la **RLS** : chaque ligne et chaque image
n'appartiennent qu'à leur propriétaire, personne d'autre ne peut les lire.

## 3. Créer ton compte

Dans **Authentication → Providers → Email**, vérifie que l'e-mail est activé.
Pour éviter d'avoir à confirmer une adresse au premier essai, tu peux désactiver
temporairement *Confirm email*.

Tu créeras le compte depuis l'application elle-même (lien « Créer un compte »).

> **Ensuite, ferme la porte :** dans **Authentication → Sign In / Providers**,
> désactive *Allow new users to sign up*. Ton compte continue de fonctionner,
> mais plus personne ne peut s'en créer un sur ton projet.

## 4. Renseigner la configuration

Dans Supabase : **Settings → API**. Reporte les deux valeurs dans
[`config.js`](config.js) :

```js
window.CARNET_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",   // « Project URL »
  supabaseAnonKey: "eyJhbGciOi…",                // clé « anon / public »
  icsProxy: ""
};
```

La clé `anon` est **publique par conception** : elle est faite pour vivre dans du
code front, et c'est la RLS qui protège les données. N'utilise jamais la clé
`service_role` ici.

*Tu peux aussi laisser ces champs vides : l'application affiche alors un écran de
configuration et retient les valeurs dans le navigateur. Pratique pour tester,
moins pour un usage quotidien sur plusieurs appareils.*

## 5. Mettre en ligne sur GitHub Pages

```bash
git init
git add .
git commit -m "Carnet : premiere mise en ligne"
git branch -M main
git remote add origin https://github.com/<ton-pseudo>/<ton-depot>.git
git push -u origin main
```

> Une commande **par ligne** : Windows PowerShell 5.1 ne comprend pas
> l'enchaînement `A && B` (c'est de la syntaxe bash). Son séparateur à lui est
> le point-virgule : `git add . ; git commit -m "…"`.
> Évite aussi les accents dans le message de commit : PowerShell 5.1 transmet
> les arguments en encodage ANSI, ce qui les abîme dans l'historique.

Puis, sur GitHub : **Settings → Pages → Build and deployment → Source :
GitHub Actions**. Le workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
publie le site à chaque `push` sur `main`.

Ton site sera à l'adresse `https://<ton-pseudo>.github.io/<ton-depot>/`.

> Le dépôt peut être public sans risque : il ne contient que la clé `anon`.
> Si tu préfères, un dépôt privé fonctionne aussi (GitHub Pages est disponible
> sur les dépôts privés selon le plan de ton compte).

## 6. Installer sur le téléphone

Ouvre l'adresse dans Chrome (Android) ou Safari (iOS), puis **Ajouter à l'écran
d'accueil**. L'application s'ouvre alors en plein écran, avec un raccourci direct
vers le scan. En rentrant de cours : une icône, un bouton, la photo.

---

## Emploi du temps

### Trouver le lien ICS

Depuis l'ENT de ton université, ouvre ton emploi du temps (ADE, Hyperplanning,
« Mon planning »…) et cherche :

- un bouton **Exporter**, **S'abonner** ou une icône de calendrier ;
- une option **« Exporter au format iCal / ICS »** ou **« Générer un lien »** ;
- choisis la période la plus large possible (l'année entière) et copie l'URL.

L'adresse ressemble à `https://…/anonymous_cal.jsp?resources=1234&projectId=…`
ou se termine par `.ics`. Une adresse `webcal://` fonctionne également.

Colle-la dans **Réglages → Lien ICS**, puis **Synchroniser**.

### Si la synchronisation échoue

C'est le cas le plus fréquent : les serveurs d'emploi du temps n'autorisent pas
les navigateurs à lire leur flux directement (blocage CORS). Trois solutions,
de la meilleure à la plus rustique :

1. **Edge Function** (recommandé). Déploie
   [`supabase/functions/ics-proxy/index.ts`](supabase/functions/ics-proxy/index.ts)
   depuis **Edge Functions → Deploy a new function** (nom : `ics-proxy`, colle le
   fichier), puis renseigne son URL dans **Réglages → Relais ICS** :
   `https://<projet>.supabase.co/functions/v1/ics-proxy`.
   La fonction n'accepte que les utilisateurs connectés.

2. **Relais public** — une case à cocher dans les réglages. Ton lien de planning
   transite alors par un service tiers (allorigins, corsproxy). Ça dépanne, mais
   c'est moins discret.

3. **Import manuel** — télécharge le `.ics` depuis l'ENT et dépose-le avec
   « Importer un .ics ». À refaire quand le planning change.

### Rapprochement cours ↔ matière

L'application relie un cours de l'emploi du temps à une matière d'abord par son
code (`R1.04` reconnu dans « R1.04 - Introduction aux bases de données TP Gr.B »),
sinon par les mots du libellé, accents et casse ignorés. C'est ce qui permet de
pré-sélectionner la bonne matière au moment du scan.

---

## Au quotidien

| Geste | Où |
|---|---|
| Scanner une feuille | bouton central de la barre du bas |
| Ranger a posteriori | fiche de la feuille → **Ranger** |
| Créer un chapitre | dans la pop-up de rangement, ou fiche matière → **+** |
| Retrouver une feuille | **Chercher** (titre, mot-clé, matière, chapitre, texte transcrit) |
| Marquer l'essentiel | étoile sur la fiche → onglet **Favoris** |
| Signaler une feuille inachevée | case « pas terminée » au rangement, ou bouton **À terminer** |
| Ce qui traîne | **Matières → À ranger** et **À terminer** |
| Lire une feuille en texte | bouton **Texte** sur la fiche, ou au survol d'une vignette |

Les filtres de scan : **Document** (par défaut, noir et blanc contrasté, idéal
pour du manuscrit), **Niveaux de gris**, **Couleur** (pour un schéma au
surligneur), **Photo brute**.

### Transcription en texte

Le bouton **Texte** convertit les images d'une feuille en texte, dans le
navigateur, via Tesseract.js. À savoir avant de s'en servir :

- **La qualité dépend énormément de l'écriture.** Le moteur est excellent sur un
  polycopié imprimé, correct sur une écriture bien détachée, et mauvais sur de
  la cursive rapide — c'est un moteur conçu pour des caractères typographiques.
- **Le résultat est un brouillon modifiable.** C'est le texte que tu corriges
  qui est enregistré, pas la sortie brute. Même partiellement corrigé, il
  devient cherchable : il alimente `sheets.ocr_text`, indexé en plein texte.
- **Premier lancement plus long.** La bibliothèque et le modèle de langue
  français (~6 Mo) se téléchargent depuis un CDN à la première utilisation, puis
  restent dans le cache du navigateur. Ensuite, comptez environ une seconde par
  page. C'est la seule dépendance réseau externe de l'application, et elle ne
  se charge que si tu cliques sur ce bouton.

Si un jour la qualité sur ton écriture ne te suffit pas, la bascule vers un
modèle de vision (transcription bien meilleure sur du manuscrit, via une Edge
Function qui garde la clé d'API hors du front) ne demanderait pas de changer le
schéma : la colonne `ocr_text` et son index sont déjà en place.

---

## Structure du projet

```
index.html                 coquille de l'application
config.js                  URL + clé Supabase (à remplir)
manifest.webmanifest, sw.js    installation sur mobile, cache hors ligne
vendor/supabase.js         client Supabase v2, embarqué (aucun CDN au runtime)
assets/css/app.css         toute la mise en forme
assets/js/
  app.js                   démarrage, routage, coquille
  supa.js  db.js  state.js connexion, requêtes, cache mémoire
  imaging.js  cropper.js   traitement des photos, recadrage
  ics.js                   lecture de l'emploi du temps
  ocr.js  transcription.js transcription des pages en texte
  components.js            grille de feuilles, pop-up de rangement
  seed.js                  matières du BUT 1 (pré-remplissage)
  views/                   une page par fichier
sql/                       schéma et stockage à exécuter dans Supabase
supabase/functions/        relais ICS optionnel
```

## Bon à savoir

- **Quotas Supabase (offre gratuite)** : 1 Go de stockage — soit environ
  10 000 pages scannées à ~100 Ko l'unité — et 500 Mo de base. Un projet gratuit
  se met en pause après une semaine sans aucune activité ; il se réveille en un
  clic depuis le tableau de bord.
- **Les images sont privées** : le bucket n'est pas public, l'application génère
  des liens signés valables une heure.
- **Sauvegarde** : **Réglages → Exporter l'index** produit un JSON de tes
  matières, chapitres et feuilles.
- **Mise à jour du site** : après un `git push`, si le téléphone affiche encore
  l'ancienne version, incrémente `CACHE` dans `sw.js` (`carnet-v1` → `carnet-v2`).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Base de données incomplète » au démarrage | les scripts SQL n'ont pas été exécutés |
| « Les inscriptions sont désactivées » | normal après l'étape 3 — utilise « Se connecter » |
| Images absentes, cadres gris | `02_storage.sql` non exécuté, ou règles du bucket manquantes |
| « Action refusée par la base (RLS) » | connexion expirée : déconnecte-toi et reconnecte-toi |
| Emploi du temps vide | voir « Si la synchronisation échoue » plus haut |

---

Les matières pré-remplies suivent le programme national du BUT Informatique ;
les intitulés varient d'un IUT à l'autre et sont tous modifiables depuis la page
**Matières**.
