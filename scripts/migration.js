/**
 * Migration script for Kids Reading Manager
 *
 * This script exports data from the current system and imports it to Cloudflare KV.
 *
 * Prerequisites:
 * 1. Create a KV namespace in Cloudflare using Wrangler CLI:
 *    wrangler kv:namespace create READING_MANAGER_KV
 * 2. Note the namespace ID from the output
 * 3. Update wrangler.toml with the namespace ID
 *
 * Usage:
 * 1. Set the SOURCE_API_URL to the URL of your current API
 * 2. Set the KV_NAMESPACE_ID to your Cloudflare KV namespace ID (from step 2 above)
 * 3. Set the CLOUDFLARE_ACCOUNT_ID to your Cloudflare account ID
 * 4. Set the CLOUDFLARE_API_TOKEN with appropriate permissions
 * 5. Run the script: node scripts/migration.js
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const SOURCE_API_URL = process.env.SOURCE_API_URL || 'http://localhost:3000/api';
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || 'your-kv-namespace-id';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'your-cloudflare-account-id';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'your-cloudflare-api-token';
const CLOUDFLARE_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values`;
const APP_DATA_KEY = 'app_data';
const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Export data from the current system
 * @returns {Promise<Object>} - Exported data
 */
async function exportData() {
  console.log(`Exporting data from ${SOURCE_API_URL}/data...`);
  
  try {
    const response = await fetch(`${SOURCE_API_URL}/data`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Exported ${data.students?.length || 0} students and settings`);
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`Backup saved to ${backupPath}`);
    
    return data;
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
}

/**
 * Import data to Cloudflare KV
 * @param {Object} data - Data to import
 * @returns {Promise<void>}
 */
async function importToKV(data) {
  console.log(`Importing data to Cloudflare KV namespace ${KV_NAMESPACE_ID}...`);
  
  try {
    // Add migration metadata
    const importData = {
      ...data,
      metadata: {
        ...data.metadata || {},
        migratedAt: new Date().toISOString(),
        migrationSource: SOURCE_API_URL,
        version: '1.0.0'
      }
    };
    
    // Upload to KV
    const response = await fetch(`${CLOUDFLARE_API_URL}/${APP_DATA_KEY}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(importData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}\n${errorText}`);
    }
    
    console.log('Data successfully imported to Cloudflare KV');
  } catch (error) {
    console.error('Error importing data to KV:', error);
    throw error;
  }
}

/**
 * Run the migration
 */
async function runMigration() {
  try {
    console.log('Starting migration...');
    
    // Validate configuration
    if (KV_NAMESPACE_ID === 'your-kv-namespace-id') {
      throw new Error('Please set the KV_NAMESPACE_ID environment variable');
    }
    if (CLOUDFLARE_ACCOUNT_ID === 'your-cloudflare-account-id') {
      throw new Error('Please set the CLOUDFLARE_ACCOUNT_ID environment variable');
    }
    if (CLOUDFLARE_API_TOKEN === 'your-cloudflare-api-token') {
      throw new Error('Please set the CLOUDFLARE_API_TOKEN environment variable');
    }
    
    // Export data from current system
    const data = await exportData();
    
    // Import data to Cloudflare KV
    await importToKV(data);
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();