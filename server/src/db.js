import pg from 'pg';
import { createPgPoolOptions } from './pgPoolConfig.js';

const { Pool } = pg;

export const pool = new Pool(createPgPoolOptions());
