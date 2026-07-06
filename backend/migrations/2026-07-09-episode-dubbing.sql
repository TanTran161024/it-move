ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS dubbed_video_url TEXT NULL AFTER subtitle_url;

CREATE TABLE IF NOT EXISTS dubbing_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  episode_id INT NOT NULL,
  subtitle_id INT NULL,
  voice VARCHAR(64) NOT NULL,
  status ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  total_segments INT UNSIGNED NOT NULL DEFAULT 0,
  completed_segments INT UNSIGNED NOT NULL DEFAULT 0,
  original_audio_volume DECIMAL(4,3) NOT NULL DEFAULT 0.250,
  output_url TEXT NULL,
  error_message TEXT NULL,
  requested_by INT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dubbing_jobs_episode_created (episode_id, created_at),
  KEY idx_dubbing_jobs_status (status),
  CONSTRAINT fk_dubbing_jobs_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  CONSTRAINT fk_dubbing_jobs_subtitle FOREIGN KEY (subtitle_id) REFERENCES episode_subtitles(id) ON DELETE SET NULL,
  CONSTRAINT fk_dubbing_jobs_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
