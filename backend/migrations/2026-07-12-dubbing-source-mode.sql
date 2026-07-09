ALTER TABLE dubbing_jobs
  ADD COLUMN IF NOT EXISTS source_mode ENUM('subtitle', 'video') NOT NULL DEFAULT 'subtitle' AFTER voice;
