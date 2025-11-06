USE eco_env;

-- 1) import country metadata
LOAD DATA LOCAL INFILE '/Users/lizi/Documents/UCL/CASA0017/Group Work/data/meta/country.csv'
INTO TABLE country
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(iso2, iso3, name);

-- 2) import indicator metadata
LOAD DATA LOCAL INFILE '/Users/lizi/Documents/UCL/CASA0017/Group Work/data/meta/indicator.csv'
INTO TABLE indicator
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(code, name, unit, igroup);

-- 3) temp staging table for datapoint import
CREATE TEMPORARY TABLE staging_datapoint (
  iso3           CHAR(3),
  indicator_code VARCHAR(64),
  year           YEAR,
  value          DOUBLE
);

LOAD DATA LOCAL INFILE '/Users/lizi/Documents/UCL/CASA0017/Group Work/data/cleaned/datapoint.csv'
INTO TABLE staging_datapoint
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(iso3, indicator_code, year, value);

-- 4) write from staging table to datapoint table
INSERT INTO datapoint (country_id, indicator_id, year, value)
SELECT c.id, i.id, s.year, s.value
FROM staging_datapoint s
JOIN country   c ON c.iso3 = s.iso3
JOIN indicator i ON i.code = s.indicator_code
ON DUPLICATE KEY UPDATE value = VALUES(value);
