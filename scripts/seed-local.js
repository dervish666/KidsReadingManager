#!/usr/bin/env node
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// PBKDF2 configuration matching src/utils/crypto.js
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

// Seed data
const ORG_ID = 'dev-org';
const ORG_NAME = 'Dev School';
const ORG_SLUG = 'dev-school';
const USER_ID = 'dev-owner';
const USER_EMAIL = 'dev@tallyreading.uk';
const USER_PASSWORD = 'password';
const USER_NAME = 'Dev Owner';

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, HASH_LENGTH, 'sha256');
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

function run(cmd) {
  try {
    execSync(cmd, { encoding: 'utf8', cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== Tally Reading Local Dev Seed ===\n');

  // Step 1: Apply migrations
  console.log('1. Applying D1 migrations locally...');
  run('npx wrangler d1 migrations apply reading-manager-db --local');
  console.log('');

  // Step 2: Generate password hash
  console.log('2. Generating password hash...');
  const passwordHash = hashPassword(USER_PASSWORD);
  console.log('   Done (PBKDF2, 100k iterations)\n');

  // Step 3: Insert seed data
  console.log('3. Inserting seed data...');
  const escapedHash = passwordHash.replace(/'/g, "''");
  const now = new Date().toISOString();

  const sql = `
INSERT OR IGNORE INTO organizations (id, name, slug, is_active, created_at, updated_at)
VALUES ('${ORG_ID}', '${ORG_NAME}', '${ORG_SLUG}', 1, '${now}', '${now}');

INSERT OR IGNORE INTO users (id, email, password_hash, name, role, organization_id, is_active, created_at, updated_at)
VALUES ('${USER_ID}', '${USER_EMAIL}', '${escapedHash}', '${USER_NAME}', 'owner', '${ORG_ID}', 1, '${now}', '${now}');
`;

  const tmpFile = path.join(os.tmpdir(), `seed-local-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');

  try {
    run(`npx wrangler d1 execute reading-manager-db --local --file ${tmpFile}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  console.log('');
  console.log('=== Local dev environment ready ===');
  console.log('');
  console.log('  npm run start:dev');
  console.log('');
  console.log('  Then log in at http://localhost:3001 with:');
  console.log(`    Email:    ${USER_EMAIL}`);
  console.log(`    Password: ${USER_PASSWORD}`);
  console.log('');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
