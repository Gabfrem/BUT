-- ============================================================================
--  Carnet — stockage des fichiers (scans, polycopiés, pièces jointes)
--  À exécuter APRÈS 01_schema.sql, dans SQL Editor. Ré-exécutable.
--
--  Si Postgres refuse la création des policies ("must be owner of table objects"),
--  crée-les à la main : Dashboard > Storage > scans > Policies > New policy,
--  avec l'expression donnée en commentaire au-dessus de chaque policy.
-- ============================================================================

-- Bucket privé : rien n'est lisible sans URL signée temporaire.
-- 50 Mo par fichier : un polycopié de cours scanné dépasse vite 15 Mo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chaque fichier vit sous  <user_id>/…
--   <user_id>/<sheet_id>/<n>.jpg   pour les pages scannées
--   <user_id>/docs/<doc_id>.<ext>  pour les documents de cours
-- => le 1er dossier doit correspondre à l'utilisateur connecté.
drop policy if exists "scans_read"   on storage.objects;
drop policy if exists "scans_write"  on storage.objects;
drop policy if exists "scans_update" on storage.objects;
drop policy if exists "scans_delete" on storage.objects;

create policy "scans_read" on storage.objects for select to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "scans_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "scans_update" on storage.objects for update to authenticated
  using      (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "scans_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);
