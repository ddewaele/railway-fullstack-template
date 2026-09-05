-- Creates a separate database for the automated test suite so tests never
-- truncate your local development data.
CREATE DATABASE app_test;
GRANT ALL PRIVILEGES ON DATABASE app_test TO app;
