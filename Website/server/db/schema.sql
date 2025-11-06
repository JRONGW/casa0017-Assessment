-- 1) create database and tables
CREATE DATABASE IF NOT EXISTS eco_env
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE eco_env;

-- 2) country table
CREATE TABLE IF NOT EXISTS country (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  iso2 CHAR(2)  NOT NULL,
  iso3 CHAR(3)  NOT NULL,
  name VARCHAR(128) NOT NULL,
  UNIQUE KEY uk_iso3 (iso3),
  UNIQUE KEY uk_name (name)
) ENGINE=InnoDB;

-- 3) add economy/environment/policy indicator table
CREATE TABLE IF NOT EXISTS indicator (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(64)  NOT NULL,    -- e.g. NY.GDP.MKTP.CD / EN.ATM.CO2E.PC / POL.CO2TAX
  name  VARCHAR(256) NOT NULL,    -- name of the indicator
  unit  VARCHAR(64),              -- unit（USD, tons/person, percent, μg/m³, index）
  igroup ENUM('economy','environment','policy') NOT NULL,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB;

-- 4) data point table
CREATE TABLE IF NOT EXISTS datapoint (
  country_id   INT NOT NULL,
  indicator_id INT NOT NULL,
  year         YEAR NOT NULL,
  value        DOUBLE NULL,
  PRIMARY KEY (country_id, indicator_id, year),
  CONSTRAINT fk_dp_country   FOREIGN KEY (country_id)   REFERENCES country(id)   ON DELETE CASCADE,
  CONSTRAINT fk_dp_indicator FOREIGN KEY (indicator_id) REFERENCES indicator(id) ON DELETE CASCADE,
  KEY idx_indicator_year (indicator_id, year),
  KEY idx_country_year   (country_id, year)
) ENGINE=InnoDB;

-- 5) quick view for series data
CREATE OR REPLACE VIEW v_series AS
SELECT c.iso3, i.code AS indicator_code, i.igroup, i.unit, d.year, d.value
FROM datapoint d
JOIN country c   ON c.id=d.country_id
JOIN indicator i ON i.id=d.indicator_id;
