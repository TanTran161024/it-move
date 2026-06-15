ALTER TABLE `movies`
  ADD COLUMN IF NOT EXISTS `views` int(11) NOT NULL DEFAULT 0 AFTER `quality`;

CREATE TABLE IF NOT EXISTS `movie_views` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `movie_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `viewed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_movie_views_movie` (`movie_id`, `viewed_at`),
  KEY `idx_movie_views_user` (`user_id`, `viewed_at`),
  CONSTRAINT `movie_views_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_views_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
