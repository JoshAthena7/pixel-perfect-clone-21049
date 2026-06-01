
insert into storage.buckets (id, name, public) values ('mission-library', 'mission-library', false)
on conflict (id) do nothing;

create policy "ml_files_select_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'mission-library'
  and public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
);

create policy "ml_files_insert_members"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mission-library'
  and public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
);

create policy "ml_files_delete_members"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mission-library'
  and public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
);
