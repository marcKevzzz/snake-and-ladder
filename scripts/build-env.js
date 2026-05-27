#!/usr/bin/env node
// ============================================================
// Build Script — Injects environment variables into js/env.js
// Runs at Vercel build time to bake env vars into the static site.
// ============================================================

const fs = require('fs');
const path = require('path');

const envVars = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
};

const output = `// Auto-generated at build time — DO NOT EDIT
// This file is created by scripts/build-env.js
export const ENV = ${JSON.stringify(envVars, null, 2)};
`;

const outPath = path.join(__dirname, '..', 'js', 'env.js');
fs.writeFileSync(outPath, output, 'utf8');

console.log('✅ js/env.js generated with environment variables');
console.log(`   SUPABASE_URL: ${envVars.SUPABASE_URL ? envVars.SUPABASE_URL.substring(0, 30) + '...' : '(empty)'}`);
console.log(`   SUPABASE_ANON_KEY: ${envVars.SUPABASE_ANON_KEY ? '***' + envVars.SUPABASE_ANON_KEY.slice(-8) : '(empty)'}`);
