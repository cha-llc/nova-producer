-- Fix fetch error: Allow public/anon read access to scripts tables

-- Allow public read on show_scripts
DROP POLICY IF EXISTS "Allow public read on show_scripts" ON show_scripts;
CREATE POLICY "Allow public read on show_scripts"
  ON show_scripts
  FOR SELECT
  USING (true);

-- Allow public read on show_configs
DROP POLICY IF EXISTS "Allow public read on show_configs" ON show_configs;
CREATE POLICY "Allow public read on show_configs"
  ON show_configs
  FOR SELECT
  USING (true);

-- Allow public read on nova_social_content
DROP POLICY IF EXISTS "Allow public read on nova_social_content" ON nova_social_content;
CREATE POLICY "Allow public read on nova_social_content"
  ON nova_social_content
  FOR SELECT
  USING (true);
