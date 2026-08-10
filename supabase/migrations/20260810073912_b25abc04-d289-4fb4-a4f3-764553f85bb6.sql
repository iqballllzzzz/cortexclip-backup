CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own uploads" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'video-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);