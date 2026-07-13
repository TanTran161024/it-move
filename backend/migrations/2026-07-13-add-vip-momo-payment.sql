-- Bổ sung các cột Mock MoMo nếu chúng chưa tồn tại.
-- Tương thích với MySQL không hỗ trợ ADD COLUMN IF NOT EXISTS.

SET @database_name = DATABASE();

-- payment_method
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vip_orders ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT ''mock_momo''',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND COLUMN_NAME = 'payment_method'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- payment_status
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vip_orders ADD COLUMN payment_status ENUM(''pending'', ''paid'', ''failed'', ''cancelled'') NOT NULL DEFAULT ''pending''',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND COLUMN_NAME = 'payment_status'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- payment_token
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vip_orders ADD COLUMN payment_token VARCHAR(120) NULL',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND COLUMN_NAME = 'payment_token'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- transaction_ref
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vip_orders ADD COLUMN transaction_ref VARCHAR(120) NULL',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND COLUMN_NAME = 'transaction_ref'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- paid_at
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE vip_orders ADD COLUMN paid_at DATETIME NULL',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND COLUMN_NAME = 'paid_at'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Unique index cho payment_token
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'CREATE UNIQUE INDEX uq_vip_orders_payment_token ON vip_orders(payment_token)',
        'SELECT 1'
    )
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND INDEX_NAME = 'uq_vip_orders_payment_token'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Index cho payment_status
SET @sql = (
    SELECT IF(
        COUNT(*) = 0,
        'CREATE INDEX idx_vip_orders_payment_status ON vip_orders(payment_status)',
        'SELECT 1'
    )
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @database_name
      AND TABLE_NAME = 'vip_orders'
      AND INDEX_NAME = 'idx_vip_orders_payment_status'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;