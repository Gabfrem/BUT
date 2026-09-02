/* Accès aux données : matières, chapitres, feuilles, pages, fichiers, réglages. */
import { sb } from './supa.js';

const BUCKET = 'scans';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------- MATIÈRES  */

export async function listSubjects({ archived = false } = {}) {
  let q = sb().from('subject_overview').select('*');
  if (archived === false) q = q.eq('archived', false);
  return unwrap(await q.order('position', { ascending: true })
                       .order('code', { ascending: true, nullsFirst: false })
                       .order('name', { ascending: true }));
}

export async function createSubject(data) {
  return unwrap(await sb().from('subjects').insert(data).select().single());
}

export async function createSubjects(rows) {
  return unwrap(await sb().from('subjects').insert(rows).select());
}

export async function updateSubject(id, patch) {
  return unwrap(await sb().from('subjects').update(patch).eq('id', id).select().single());
}

export async function deleteSubject(id) {
  unwrap(await sb().from('subjects').delete().eq('id', id));
}

/* ------------------------------------------------------------ CHAPITRES  */

export async function listChapters(subjectId) {
  let q = sb().from('chapter_overview').select('*');
  if (subjectId) q = q.eq('subject_id', subjectId);
  return unwrap(await q.order('position', { ascending: true })
                       .order('created_at', { ascending: true }));
}

export async function createChapter(subjectId, name, position = 0) {
  return unwrap(await sb().from('chapters')
    .insert({ subject_id: subjectId, name, position }).select().single());
}

export async function updateChapter(id, patch) {
  return unwrap(await sb().from('chapters').update(patch).eq('id', id).select().single());
}

export async function deleteChapter(id) {
  unwrap(await sb().from('chapters').delete().eq('id', id));
}

/* -------------------------------------------------------------- FEUILLES */

const SHEET_COLS = '*';

/**
 * Liste des feuilles avec filtres.
 * @param {{subjectId?, chapterId?, unfiled?, starred?, limit?, from?, to?}} f
 */
export async function listSheets(f = {}) {
  let q = sb().from('sheet_overview').select(SHEET_COLS);
  if (f.subjectId)  q = q.eq('subject_id', f.subjectId);
  if (f.subjectIds?.length) q = q.in('subject_id', f.subjectIds);
  if (f.chapterId)  q = q.eq('chapter_id', f.chapterId);
  if (f.noChapter)  q = q.is('chapter_id', null);
  if (f.unfiled)    q = q.is('subject_id', null);
  if (f.starred)    q = q.eq('starred', true);
  if (f.unfinished) q = q.eq('unfinished', true);
  if (f.from)       q = q.gte('taken_on', f.from);
  if (f.to)         q = q.lte('taken_on', f.to);
  q = q.order('taken_on', { ascending: false }).order('created_at', { ascending: false });
  if (f.limit) q = q.limit(f.limit);
  return unwrap(await q);
}

export async function getSheet(id) {
  return unwrap(await sb().from('sheet_overview').select(SHEET_COLS).eq('id', id).single());
}

export async function createSheet(data) {
  return unwrap(await sb().from('sheets').insert(data).select().single());
}

export async function updateSheet(id, patch) {
  return unwrap(await sb().from('sheets').update(patch).eq('id', id).select().single());
}

/** Supprime la feuille, ses pages (cascade) et les fichiers associés. */
export async function deleteSheet(id) {
  const pages = await listPages(id);
  const paths = pages.map((p) => p.storage_path).filter(Boolean);
  if (paths.length) {
    const { error } = await sb().storage.from(BUCKET).remove(paths);
    if (error) console.warn('Fichiers non supprimés :', error.message);
  }
  unwrap(await sb().from('sheets').delete().eq('id', id));
}

export async function countSheets(filter = {}) {
  let q = sb().from('sheets').select('id', { count: 'exact', head: true });
  if (filter.unfiled)    q = q.is('subject_id', null);
  if (filter.unfinished) q = q.eq('unfinished', true);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/* ----------------------------------------------------------------- PAGES */

export async function listPages(sheetId) {
  return unwrap(await sb().from('pages').select('*')
    .eq('sheet_id', sheetId).order('position', { ascending: true }));
}

export async function addPage(row) {
  return unwrap(await sb().from('pages').insert(row).select().single());
}

export async function deletePage(page) {
  if (page.storage_path) {
    const { error } = await sb().storage.from(BUCKET).remove([page.storage_path]);
    if (error) console.warn('Fichier non supprimé :', error.message);
  }
  unwrap(await sb().from('pages').delete().eq('id', page.id));
}

export async function reorderPages(pages) {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].position !== i) {
      unwrap(await sb().from('pages').update({ position: i }).eq('id', pages[i].id));
    }
  }
}

/* -------------------------------------------------------------- FICHIERS */

/** Envoie une image ; renvoie le chemin de stockage. */
export async function uploadImage(userId, sheetId, index, blob) {
  const path = `${userId}/${sheetId}/${String(index).padStart(2, '0')}.jpg`;
  const { error } = await sb().storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) throw new Error(error.message);
  return path;
}

/* Cache mémoire des URLs signées (elles expirent, on les régénère). */
const urlCache = new Map();   // path -> { url, exp }
const TTL = 3600;             // secondes

export async function signedUrl(path) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now() + 60000) return hit.url;
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error) throw new Error(error.message);
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
  return data.signedUrl;
}

/** Version groupée : un seul aller-retour pour une grille de vignettes. */
export async function signedUrls(paths) {
  const out = new Map();
  const todo = [];
  for (const p of paths.filter(Boolean)) {
    const hit = urlCache.get(p);
    if (hit && hit.exp > Date.now() + 60000) out.set(p, hit.url);
    else if (!todo.includes(p)) todo.push(p);
  }
  for (let i = 0; i < todo.length; i += 90) {
    const chunk = todo.slice(i, i + 90);
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(chunk, TTL);
    if (error) throw new Error(error.message);
    data.forEach((d) => {
      if (d.signedUrl && !d.error) {
        urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + TTL * 1000 });
        out.set(d.path, d.signedUrl);
      }
    });
  }
  return out;
}

/* -------------------------------------------------------------- RÉGLAGES */

export async function getSettings(userId) {
  const { data, error } = await sb().from('settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || { user_id: userId, ics_url: null, ics_events: [], ics_synced_at: null };
}

export async function saveSettings(userId, patch) {
  return unwrap(await sb().from('settings')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select().single());
}

/* ======================================================================== */
/*  DOCUMENTS DE COURS (polycopiés, sujets de TD, corrigés…)                */
/* ======================================================================== */

export async function listDocuments(f = {}) {
  let q = sb().from('document_overview').select('*');
  if (f.subjectId) q = q.eq('subject_id', f.subjectId);
  if (f.chapterId) q = q.eq('chapter_id', f.chapterId);
  if (f.noChapter) q = q.is('chapter_id', null);
  q = q.order('created_at', { ascending: false });
  if (f.limit) q = q.limit(f.limit);
  return unwrap(await q);
}

export async function createDocument(data) {
  return unwrap(await sb().from('documents').insert(data).select().single());
}

export async function updateDocument(id, patch) {
  return unwrap(await sb().from('documents').update(patch).eq('id', id).select().single());
}

/** Supprime la fiche et le fichier associé. */
export async function deleteDocument(doc) {
  if (doc.storage_path) {
    const { error } = await sb().storage.from(BUCKET).remove([doc.storage_path]);
    if (error) console.warn('Fichier non supprimé :', error.message);
  }
  unwrap(await sb().from('documents').delete().eq('id', doc.id));
}

/** Envoie un fichier de cours ; renvoie son chemin de stockage. */
export async function uploadDocument(userId, file) {
  const ext = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin').toLowerCase();
  const id = (crypto.randomUUID?.() || String(Date.now()));
  const path = `${userId}/docs/${id}.${ext}`;
  const { error } = await sb().storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/* ======================================================================== */
/*  CODE                                                                    */
/* ======================================================================== */

export async function listSnippets(f = {}) {
  let q = sb().from('snippet_overview').select('*');
  if (f.subjectId) q = q.eq('subject_id', f.subjectId);
  if (f.chapterId) q = q.eq('chapter_id', f.chapterId);
  if (f.noChapter) q = q.is('chapter_id', null);
  q = q.order('updated_at', { ascending: false });
  if (f.limit) q = q.limit(f.limit);
  return unwrap(await q);
}

export async function createSnippet(data) {
  return unwrap(await sb().from('snippets').insert(data).select().single());
}

export async function updateSnippet(id, patch) {
  return unwrap(await sb().from('snippets').update(patch).eq('id', id).select().single());
}

export async function deleteSnippet(id) {
  unwrap(await sb().from('snippets').delete().eq('id', id));
}
