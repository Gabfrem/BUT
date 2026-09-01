/* Matières du BUT Informatique — 1re année (programme national).
 * Ce ne sont que des valeurs de départ : tout est renommable / supprimable
 * depuis la page Matières, et les intitulés varient un peu d'un IUT à l'autre. */

import { PALETTE } from './ui.js';

export const SEED = {
  S1: [
    ['R1.01', "Initiation au développement",                    'ressource'],
    ['R1.02', "Développement d'interfaces web",                 'ressource'],
    ['R1.03', "Introduction à l'architecture des ordinateurs",  'ressource'],
    ['R1.04', "Introduction aux bases de données",              'ressource'],
    ['R1.05', "Introduction aux réseaux",                       'ressource'],
    ['R1.06', "Mathématiques discrètes",                        'ressource'],
    ['R1.07', "Outils mathématiques fondamentaux",              'ressource'],
    ['R1.08', "Gestion de projet et des organisations",         'ressource'],
    ['R1.09', "Économie durable et numérique",                  'ressource'],
    ['R1.10', "Anglais",                                        'ressource'],
    ['R1.11', "Bases de la communication",                      'ressource'],
    ['R1.12', "Projet personnel et professionnel",              'ressource'],
    ['SAÉ 1.01', "Implémentation d'un besoin client",           'sae'],
    ['SAÉ 1.02', "Comparaison d'approches algorithmiques",      'sae'],
    ['SAÉ 1.03', "Installation d'un poste de développement",    'sae'],
    ['SAÉ 1.04', "Création d'une base de données",              'sae'],
    ['SAÉ 1.05', "Recueil de besoins",                          'sae'],
    ['SAÉ 1.06', "Environnement économique et écologique",      'sae']
  ],
  S2: [
    ['R2.01', "Développement orienté objets",                   'ressource'],
    ['R2.02', "Développement d'applications avec IHM",          'ressource'],
    ['R2.03', "Qualité de développement",                       'ressource'],
    ['R2.04', "Communication et fonctionnement bas niveau",     'ressource'],
    ['R2.05', "Introduction aux services réseaux",              'ressource'],
    ['R2.06', "Exploitation d'une base de données",             'ressource'],
    ['R2.07', "Graphes",                                        'ressource'],
    ['R2.08', "Outils numériques pour les statistiques",        'ressource'],
    ['R2.09', "Méthodes numériques",                            'ressource'],
    ['R2.10', "Gestion des systèmes d'information",             'ressource'],
    ['R2.11', "Introduction à la gestion budgétaire",           'ressource'],
    ['R2.12', "Anglais",                                        'ressource'],
    ['R2.13', "Communication technique",                        'ressource'],
    ['R2.14', "Projet personnel et professionnel",              'ressource'],
    ['SAÉ 2.01', "Développement d'une application",             'sae'],
    ['SAÉ 2.02', "Exploration algorithmique d'un problème",     'sae'],
    ['SAÉ 2.03', "Installation de services réseau",             'sae'],
    ['SAÉ 2.04', "Exploitation d'une base de données",          'sae'],
    ['SAÉ 2.05', "Gestion d'un projet",                         'sae'],
    ['SAÉ 2.06', "Organisation d'un déplacement professionnel", 'sae']
  ]
};

/** Prépare les lignes à insérer pour un semestre. */
export function seedRows(semester, startPosition = 0) {
  const list = SEED[semester] || [];
  return list.map(([code, name, kind], i) => ({
    code,
    name,
    kind,
    semester,
    color: PALETTE[(startPosition + i) % PALETTE.length],
    position: startPosition + i
  }));
}
