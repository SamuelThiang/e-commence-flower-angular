/**
 * Run a .sql file against the database from env.
 * Usage: node scripts/run-sql.js db/schema.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createPgPoolOptions } from '../src/pgPoolConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-sql.js <path-to.sql>');
  process.exit(1);
}

const full = path.resolve(__dirname, '..', sqlFile);
const sql = fs.readFileSync(full, 'utf8');

const pool = new pg.Pool(createPgPoolOptions());

pool
  .query(sql)
  .then(() => {
    console.log('SQL applied:', full);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
