-- Bucket Storage: avatar e foto animali pubblici in lettura, documenti di
-- verifica identità privati. Convenzione dei path: "{auth.uid()}/nomefile.ext"
-- — le policy sotto usano il primo segmento del path per verificare il
-- proprietario, quindi backend e client devono rispettarla.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('pet-photos', 'pet-photos', true),
  ('verification-documents', 'verification-documents', false)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_owner_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pet_photos_public_read" on storage.objects
  for select using (bucket_id = 'pet-photos');
create policy "pet_photos_owner_write" on storage.objects
  for insert with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pet_photos_owner_update" on storage.objects
  for update using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "verification_documents_owner_read" on storage.objects
  for select using (
    bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "verification_documents_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
