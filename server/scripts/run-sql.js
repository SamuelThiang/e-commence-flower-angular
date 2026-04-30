/**
 * Run a .sql file against the database from env.
 * Usage: node scripts/run-sql.js db/schema.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-sql.js <path-to.sql>');
  process.exit(1);
}

const full = path.resolve(__dirname, '..', sqlFile);
const sql = fs.readFileSync(full, 'utf8');

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  database: process.env.DATABASE_NAME || 'ecommerce_florist_db',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD,
});

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
