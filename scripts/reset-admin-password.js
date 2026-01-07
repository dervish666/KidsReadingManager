#!/usr/bin/env node
/**
 * Admin Password Reset Script
 *
 * This script resets a user's password directly in the D1 database.
 * Used for emergency access recovery when normal password reset isn't available.
 *
 * Usage:
 *   # Local database
 *   node scripts/reset-admin-password.js --email admin@example.com --password newpassword123
 *
 *   # Remote (production) database
 *   node scripts/reset-admin-password.js --email admin@example.com --password newpassword123 --remote
 */

const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : null;
};

const email = getArg('email');
const password = getArg('password');
const isRemote = args.includes('--remote');

if (!email || !password) {
  console.error('Usage: node scripts/reset-admin-password.js --email <email> --password <newpassword> [--remote]');
  console.error('');
  console.error('Options:');
  console.error('  --email     User email address');
  console.error('  --password  New password (min 8 characters recommended)');
  console.error('  --remote    Apply to production database (default: local)');
  process.exit(1);
}

if (password.length < 8) {
  console.warn('Warning: Password is less than 8 characters. Consider using a stronger password.');
}

// PBKDF2 configuration matching crypto.js
// Note: Cloudflare Workers Web Crypto API has a max of 100,000 iterations
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

async function hashPassword(password) {
  const crypto = require('crypto');

  // Generate random salt
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key using PBKDF2
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    HASH_LENGTH,
    'sha256'
  );

  // Return in same format as crypto.js: base64(salt):base64(hash)
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

async function main() {
  console.log(`Resetting password for: ${email}`);
  console.log(`Target database: ${isRemote ? 'REMOTE (production)' : 'LOCAL'}`);
  console.log('');

  // Generate new password hash
  const passwordHash = await hashPassword(password);
  console.log('Generated new password hash with 100,000 PBKDF2 iterations');

  // Escape single quotes in the hash for SQL
  const escapedHash = passwordHash.replace(/'/g, "''");

  // Build the SQL command
  const sql = `UPDATE users SET password_hash = '${escapedHash}', updated_at = datetime('now') WHERE email = '${email.toLowerCase()}'`;

  // Build wrangler command
  const remoteFlag = isRemote ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute reading-manager-db ${remoteFlag} --command "${sql}"`;

  console.log('Executing database update...');

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log('');
    console.log('Password reset successful!');
    console.log(`User ${email} can now log in with the new password.`);

    if (output.includes('0 rows')) {
      console.warn('');
      console.warn('Warning: No rows were updated. Check if the email address is correct.');
    }
  } catch (error) {
    console.error('');
    console.error('Failed to reset password:', error.message);
    if (error.stderr) {
      console.error(error.stderr);
    }
    process.exit(1);
  }
}

main().catch(console.error);
