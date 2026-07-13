ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_until DATETIME NULL AFTER is_active;

CREATE TABLE IF NOT EXISTS vip_plans (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  duration_days INT NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS vip_orders (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_note VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by INT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vip_orders_user (user_id),
  KEY idx_vip_orders_status (status),
  CONSTRAINT fk_vip_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vip_orders_plan FOREIGN KEY (plan_id) REFERENCES vip_plans(id),
  CONSTRAINT fk_vip_orders_admin FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS advertisements (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  image_url TEXT NOT NULL,
  target_url TEXT NULL,
  placement ENUM('home','movie_detail','watch_top','watch_bottom','watch_popup') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ads_placement_active (placement, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO vip_plans (name, duration_days, price, description)
SELECT 'VIP 30 ngày', 30, 49000, 'Không quảng cáo và ưu tiên nội dung VIP trong 30 ngày'
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration_days = 30);
INSERT INTO vip_plans (name, duration_days, price, description)
SELECT 'VIP 90 ngày', 90, 129000, 'Tiết kiệm hơn với 90 ngày VIP'
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration_days = 90);
INSERT INTO vip_plans (name, duration_days, price, description)
SELECT 'VIP 365 ngày', 365, 399000, 'Trọn một năm trải nghiệm VIP không quảng cáo'
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration_days = 365);
