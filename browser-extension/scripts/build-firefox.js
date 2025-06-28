#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const distDir = 'dist';

// 1. First, temporarily replace the manifest.json with the Firefox version
const originalManifest = readFileSync('manifest.json', 'utf-8');
const firefoxManifest = readFileSync('manifest.firefox.json', 'utf-8');

// Backup the original and replace with Firefox version
writeFileSync('manifest.json.backup', originalManifest);
writeFileSync('manifest.json', firefoxManifest);

console.log('🔄 Temporarily replaced manifest.json with Firefox version');

try {
  // 2. Run the build
  console.log('📦 Building extension with Firefox manifest...');
  execSync('vue-tsc && vite build', { stdio: 'inherit' });
  
  // 3. Clean up Firefox-incompatible properties from the built manifest
  const builtManifestPath = join(distDir, 'manifest.json');
  const builtManifest = JSON.parse(readFileSync(builtManifestPath, 'utf-8'));
  
  // Remove Chrome-specific properties that Firefox doesn't support
  if (builtManifest.web_accessible_resources) {
    builtManifest.web_accessible_resources.forEach(resource => {
      delete resource.use_dynamic_url;
    });
  }
  
  // Write the cleaned manifest back
  writeFileSync(builtManifestPath, JSON.stringify(builtManifest, null, 2));
  
  console.log('✅ Firefox build completed successfully');
  console.log('🧹 Cleaned Chrome-specific properties from manifest');
} finally {
  // 4. Restore the original manifest
  writeFileSync('manifest.json', originalManifest);
  console.log('🔄 Restored original manifest.json');
}