-- Runs once when the docker compose database is first created.
-- The API test suite (apps/api/tests) uses this separate database.
create database seecode_test owner seecode;
