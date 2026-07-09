ALTER TABLE dubbing_jobs
  ADD COLUMN IF NOT EXISTS stage VARCHAR(32) NOT NULL DEFAULT 'queued' AFTER status,
  ADD COLUMN IF NOT EXISTS sync_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER voice,
  ADD COLUMN IF NOT EXISTS sync_offset_seconds DECIMAL(9,3) NULL AFTER original_audio_volume,
  ADD COLUMN IF NOT EXISTS sync_drift_seconds DECIMAL(9,3) NULL AFTER sync_offset_seconds,
  ADD COLUMN IF NOT EXISTS quality_report_json JSON NULL AFTER sync_drift_seconds;
