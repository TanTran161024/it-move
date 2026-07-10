CREATE TABLE IF NOT EXISTS `ai_recommendation_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_key` varchar(160) DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `profile_id` int DEFAULT NULL,
  `movie_id` int DEFAULT NULL,
  `event_type` varchar(32) NOT NULL,
  `position` smallint unsigned DEFAULT NULL,
  `source` varchar(64) DEFAULT NULL,
  `provider` varchar(64) DEFAULT NULL,
  `latency_ms` int unsigned DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ai_recommendation_event_key` (`event_key`),
  KEY `idx_ai_recommendation_events_created` (`created_at`),
  KEY `idx_ai_recommendation_events_type_created` (`event_type`, `created_at`),
  KEY `idx_ai_recommendation_events_request` (`request_id`, `created_at`),
  KEY `idx_ai_recommendation_events_profile` (`profile_id`, `created_at`),
  KEY `idx_ai_recommendation_events_movie` (`movie_id`, `event_type`, `created_at`),
  CONSTRAINT `ai_recommendation_events_session_fk`
    FOREIGN KEY (`session_id`) REFERENCES `ai_chat_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_recommendation_events_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_recommendation_events_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_recommendation_events_movie_fk`
    FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
