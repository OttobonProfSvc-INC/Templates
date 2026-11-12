/**
 * sBLOOM Template & Content Hub — Supabase Live PostgREST Inspection Tool
 * Script: apps/backend/inspect-supabase.js
 *
 * READ-ONLY INSPECTION ONLY:
 * - Does not perform DDL, INSERT, UPDATE, or DELETE.
 * - Does not modify .env or expose raw credentials.
 * - Inspects PostgREST OpenAPI metadata to inventory exposed tables and RPC functions.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Resolve .env file
const envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('[Inspection Error] apps/backend/.env not found.');
  process.exit(1);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath));
const supabaseUrl = envConfig.SUPABASE_URL;
const anonKey = envConfig.SUPABASE_ANON_KEY;
const serviceRoleKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('[Inspection Error] Missing SUPABASE_URL in apps/backend/.env');
  process.exit(1);
}

const apiKey = serviceRoleKey || anonKey;
if (!apiKey) {
  console.error('[Inspection Error] Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY found in .env');
  process.exit(1);
}

const credentialType = serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY (privileged)' : 'SUPABASE_ANON_KEY (public client)';

async function inspectSupabase() {
  console.log('==============================================================================');
  console.log('sBLOOM SUPABASE LIVE READ-ONLY ENDPOINT INSPECTION');
  console.log('==============================================================================');
  console.log(`Endpoint URL:     ${supabaseUrl}`);
  console.log(`Auth Credential:  ${credentialType}`);
  console.log(`Local Time:       ${new Date().toISOString()}`);
  console.log('------------------------------------------------------------------------------');

  // Test 1: Connectivity & OpenAPI Schema
  try {
    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/openapi+json, application/json'
      }
    });

    if (!response.ok) {
      console.error(`[Connectivity FAIL] HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response details: ${text.slice(0, 300)}`);
      process.exit(1);
    }

    console.log('[Connectivity PASS] HTTP 200 OK — Connected successfully to PostgREST.');
    const contentType = response.headers.get('content-type') || '';
    console.log(`Response Type:    ${contentType}`);

    const spec = await response.json();
    console.log(`Schema Title:     ${spec.info?.title || 'Unknown'}`);
    console.log(`PostgREST Ver:    ${spec.info?.version || 'Unknown'}`);
    console.log('------------------------------------------------------------------------------');

    // Test 2: Inventory All Tables & Categorize by Application Prefix
    const definitions = spec.definitions ? Object.keys(spec.definitions) : [];
    console.log(`TOTAL EXPOSED TABLES / ENTITIES: ${definitions.length}`);

    const categories = {};
    for (const tableName of definitions) {
      let prefix = 'other';
      if (tableName.startsWith('opdesk_') || tableName.startsWith('opdesk')) {
        prefix = 'opdesk';
      } else if (tableName.startsWith('pharma_') || tableName.startsWith('pharma')) {
        prefix = 'pharma';
      } else if (tableName.toLowerCase().startsWith('hrms_') || tableName.startsWith('HRMS_')) {
        prefix = 'hrms';
      } else if (tableName.endsWith('_templatedhub') || tableName.includes('templatedhub')) {
        prefix = 'sbloom_templatedhub';
      } else if (tableName.includes('_')) {
        prefix = tableName.split('_')[0].toLowerCase();
      }
      if (!categories[prefix]) categories[prefix] = [];
      categories[prefix].push(tableName);
    }

    console.log('\nTABLE INVENTORY CATEGORIZED BY APPLICATION PREFIX:');
    for (const [prefix, list] of Object.entries(categories).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  • [${prefix.toUpperCase()}]: ${list.length} tables`);
    }

    // Detailed breakdown per application group
    console.log('\nBreakdown of major groups:');
    for (const [prefix, list] of Object.entries(categories).sort((a, b) => b[1].length - a[1].length)) {
      if (list.length <= 10) {
        console.log(`    - ${prefix} (${list.length}): ${list.join(', ')}`);
      } else {
        console.log(`    - ${prefix} (${list.length}): ${list.slice(0, 5).join(', ')}, ... (+${list.length - 5} more)`);
      }
    }

    // Test 3: sBLOOM Table Existence Check (*_templatedhub)
    console.log('\n------------------------------------------------------------------------------');
    console.log('sBLOOM (*_templatedhub) DOMAIN TABLES AUDIT:');
    const sbloomTables = definitions.filter(t => t.endsWith('_templatedhub') || t.includes('templatedhub'));

    if (sbloomTables.length === 0) {
      console.log('STATUS: ZERO (0) sBLOOM tables exist in this database.');
      console.log('NOTE:   The target Supabase instance currently hosts existing applications (opdesk, pharma, hrms)');
      console.log('        and has NOT yet had 02_create_schema.sql executed.');
    } else {
      console.log(`STATUS: Found ${sbloomTables.length} sBLOOM table(s):`);
      sbloomTables.forEach(t => console.log(`  - ${t}`));
    }

    // Test 4: RPC Functions Audit
    console.log('\n------------------------------------------------------------------------------');
    console.log('EXPOSED RPC FUNCTIONS AUDIT (/rpc/*):');
    const rpcPaths = Object.keys(spec.paths || {})
      .filter(p => p.startsWith('/rpc/'))
      .map(p => p.replace('/rpc/', ''));

    console.log(`Total RPC routines: ${rpcPaths.length}`);
    const sbloomRpcs = ['bootstrap_first_admin', 'bootstrap_social_post_asset_type', 'ingest_master_template', 'create_customization', 'save_customization_revision'];
    const installedSbloomRpcs = rpcPaths.filter(r => sbloomRpcs.includes(r));

    if (installedSbloomRpcs.length === 0) {
      console.log('sBLOOM RPCs installed: NONE (0/5)');
    } else {
      console.log(`sBLOOM RPCs installed (${installedSbloomRpcs.length}/5): ${installedSbloomRpcs.join(', ')}`);
    }

    console.log('Existing application RPCs:');
    rpcPaths.forEach(r => console.log(`  - ${r}`));

    console.log('==============================================================================');
    console.log('INSPECTION RESULT: COMPLETED READ-ONLY AUDIT');
    console.log('==============================================================================');
  } catch (err) {
    console.error('[Inspection Error]', err);
    process.exit(1);
  }
}

inspectSupabase();
