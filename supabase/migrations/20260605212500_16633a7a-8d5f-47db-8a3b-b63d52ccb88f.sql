
CREATE POLICY "mission-matrix admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mission-matrix' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mission-matrix admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mission-matrix' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mission-matrix admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mission-matrix' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mission-matrix admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mission-matrix' AND public.has_role(auth.uid(), 'admin'));
