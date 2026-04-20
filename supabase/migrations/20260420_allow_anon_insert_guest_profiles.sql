-- Allow edge function (using anon key) to insert new guest accounts
CREATE POLICY "Allow anon signup insert"
  ON guest_profiles
  FOR INSERT
  WITH CHECK (true);
