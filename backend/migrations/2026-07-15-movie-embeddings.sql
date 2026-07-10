CREATE TABLE IF NOT EXISTS `movie_embeddings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `movie_id` int NOT NULL,
  `model` varchar(96) NOT NULL,
  `dimensions` smallint unsigned NOT NULL,
  `content_hash` char(64) NOT NULL,
  `embedding` json NOT NULL,
  `source_chars` int unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_movie_embedding_version` (`movie_id`, `model`, `dimensions`),
  KEY `idx_movie_embeddings_model` (`model`, `dimensions`, `updated_at`),
  CONSTRAINT `movie_embeddings_movie_fk`
    FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
