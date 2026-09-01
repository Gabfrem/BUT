-- ============================================================================
--  Carnet — stockage des images de scans
--  À exécuter APRÈS 01_schema.sql, dans SQL Editor.
--
--  Si Postgres refuse la création des policies ("must be owner of table objects"),
--  crée-les à la main : Dashboard > Storage > scans > Policies > New policy,
--  avec l'expression donnée en commentaire au-dessus de chaque policy.
-- ============================================================================

-- Bucket privé : les images ne sont lisibles que via des URLs signées temporaires.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 15728640,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = 15728640,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Chaque fichier vit sous  <user_id>/<sheet_id>/<n>.jpg
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
