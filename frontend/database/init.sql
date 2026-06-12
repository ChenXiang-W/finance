-- ============================================================
-- 金融欺诈智能检测系统 — MySQL 数据库初始化
-- ============================================================

CREATE DATABASE IF NOT EXISTS fraud_detector
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fraud_detector;

-- ============================================================
-- 1. 管理员表
-- ============================================================
CREATE TABLE admins (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,              -- bcrypt hash
  role        ENUM('super','editor','viewer') DEFAULT 'editor',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 默认管理员 (密码: admin123)
INSERT INTO admins (username, password, role) VALUES
  ('admin', '$2b$12$VJ2q/tGI7bKek9aN5UT5SeilQrnmA/fjO3U6/mSgQ5JIOG3UCSX1W', 'super');

-- ============================================================
-- 2. 用户表
-- ============================================================
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  email       VARCHAR(100),
  role        ENUM('analyst','viewer','banned') DEFAULT 'analyst',
  api_key     VARCHAR(64),                       -- DeepSeek API key
  last_login  DATETIME,
  login_count INT DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 3. 训练案例表
-- ============================================================
CREATE TABLE fraud_cases (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  text          TEXT         NOT NULL,             -- 欺诈文本内容
  fraud_type    VARCHAR(50)  NOT NULL,             -- 冒充客服/虚假投资/冒充公检法/信贷诈骗/正常
  risk_level    ENUM('low','medium','high','critical') DEFAULT 'medium',
  risk_score    DECIMAL(4,2) DEFAULT 0.00,         -- 0.00 - 1.00
  source        VARCHAR(100),                      -- 数据来源
  analysis      TEXT,                               -- 人工标注的分析
  tags          VARCHAR(255),                       -- 逗号分隔标签
  is_active     BOOLEAN DEFAULT TRUE,               -- 是否用于训练
  created_by    INT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_fraud_type (fraud_type),
  INDEX idx_risk_level (risk_level),
  INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- ============================================================
-- 4. 检测记录表
-- ============================================================
CREATE TABLE detection_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(100) NOT NULL,
  user_id       INT,
  input_text    TEXT         NOT NULL,
  risk_score    DECIMAL(4,2),
  risk_level    VARCHAR(20),
  fraud_type    VARCHAR(50),
  result_json   JSON,                              -- 完整检测结果
  model_used    VARCHAR(50) DEFAULT 'finetuned',   -- finetuned / deepseek / hybrid
  latency_ms    INT,                                -- 推理耗时
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_session (session_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- 5. 模型版本表
-- ============================================================
CREATE TABLE model_versions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_name  VARCHAR(50) NOT NULL,
  model_path    VARCHAR(255) NOT NULL,
  base_model    VARCHAR(100),                      -- Qwen2.5-7B-Instruct
  accuracy      DECIMAL(5,2),                       -- 验证集准确率
  f1_score      DECIMAL(5,2),
  is_active     BOOLEAN DEFAULT FALSE,
  trained_at    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
