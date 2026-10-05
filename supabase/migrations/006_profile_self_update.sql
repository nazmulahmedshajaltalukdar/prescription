-- Allow signed-in staff to update their display name without changing role or clinic scope.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant update (full_name) on public.profiles to authenticated;
