ALTER TABLE `movies`
  ADD COLUMN IF NOT EXISTS `is_visible` tinyint(1) NOT NULL DEFAULT 1 AFTER `views`;
