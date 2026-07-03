ALTER TABLE `movie_reports`
  ADD COLUMN IF NOT EXISTS `report_type` varchar(80) DEFAULT NULL AFTER `reason`,
  ADD COLUMN IF NOT EXISTS `resolved_at` datetime DEFAULT NULL AFTER `admin_note`,
  ADD COLUMN IF NOT EXISTS `notified_at` datetime DEFAULT NULL AFTER `resolved_at`;

ALTER TABLE `movie_reports`
  MODIFY `status` enum('open','new','processing','resolved','rejected') NOT NULL DEFAULT 'new';

UPDATE `movie_reports`
SET `status` = 'new'
WHERE `status` = 'open';

UPDATE `movie_reports`
SET `report_type` = CASE
  WHEN LOWER(`reason`) LIKE '%link%' THEN 'dead_link'
  WHEN LOWER(`reason`) LIKE '%sai%' THEN 'wrong_episode'
  WHEN LOWER(`reason`) LIKE '%audio%' OR LOWER(`reason`) LIKE '%am thanh%' OR LOWER(`reason`) LIKE '%âm thanh%' THEN 'audio'
  WHEN LOWER(`reason`) LIKE '%sub%' OR LOWER(`reason`) LIKE '%phu de%' OR LOWER(`reason`) LIKE '%phụ đề%' THEN 'subtitle'
  WHEN LOWER(`reason`) LIKE '%khong phat%' OR LOWER(`reason`) LIKE '%không phát%' OR LOWER(`reason`) LIKE '%video%' THEN 'playback'
  ELSE 'other'
END
WHERE `report_type` IS NULL OR `report_type` = '';

ALTER TABLE `movie_reports`
  MODIFY `report_type` varchar(80) NOT NULL DEFAULT 'other',
  MODIFY `status` enum('new','processing','resolved','rejected') NOT NULL DEFAULT 'new',
  ADD KEY `idx_movie_reports_type_status` (`report_type`, `status`, `created_at`);

CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` varchar(60) NOT NULL DEFAULT 'system',
  `title` varchar(180) NOT NULL,
  `message` text DEFAULT NULL,
  `link_url` varchar(500) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_notifications_user` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `user_notifications_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
