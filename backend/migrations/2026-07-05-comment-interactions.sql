ALTER TABLE `movie_comments`
  ADD COLUMN IF NOT EXISTS `parent_id` int(11) DEFAULT NULL AFTER `movie_id`,
  ADD COLUMN IF NOT EXISTS `is_spoiler` tinyint(1) NOT NULL DEFAULT 0 AFTER `content`,
  ADD COLUMN IF NOT EXISTS `report_count` int(11) NOT NULL DEFAULT 0 AFTER `status`;

ALTER TABLE `movie_comments`
  MODIFY `status` enum('pending','visible','hidden','deleted') NOT NULL DEFAULT 'visible',
  ADD KEY `idx_movie_comments_parent` (`parent_id`),
  ADD CONSTRAINT `movie_comments_parent_fk`
    FOREIGN KEY (`parent_id`) REFERENCES `movie_comments` (`id`) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS `movie_comment_likes` (
  `comment_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`comment_id`, `user_id`),
  KEY `idx_movie_comment_likes_user` (`user_id`),
  CONSTRAINT `movie_comment_likes_comment_fk`
    FOREIGN KEY (`comment_id`) REFERENCES `movie_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_comment_likes_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `movie_comment_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comment_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `reason` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('open','resolved','rejected') NOT NULL DEFAULT 'open',
  `admin_note` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_comment_reports_comment` (`comment_id`, `status`, `created_at`),
  KEY `idx_comment_reports_user` (`user_id`),
  CONSTRAINT `movie_comment_reports_comment_fk`
    FOREIGN KEY (`comment_id`) REFERENCES `movie_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_comment_reports_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
