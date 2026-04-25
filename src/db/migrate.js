#!/usr/bin/env node
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running schema migration...');
  await conn.query(sql);
  console.log('Database initialized successfully.');
  await conn.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
