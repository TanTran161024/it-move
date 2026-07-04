ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS hls_url TEXT NULL AFTER video_url,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NULL AFTER hls_url,
  ADD COLUMN IF NOT EXISTS preview_url TEXT NULL AFTER thumbnail_url,
  ADD COLUMN IF NOT EXISTS duration_seconds INT NULL AFTER preview_url,
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER duration_seconds;
