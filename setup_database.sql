CREATE DATABASE IF NOT EXISTS tronnest;
CREATE USER IF NOT EXISTS 'tronnest_user'@'localhost' IDENTIFIED BY 'tronnest_password';
GRANT ALL PRIVILEGES ON tronnest.* TO 'tronnest_user'@'localhost';
FLUSH PRIVILEGES;
