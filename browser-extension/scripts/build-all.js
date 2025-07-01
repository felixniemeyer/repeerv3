#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Clean up previous builds
console.log('🧹 Cleaning previous builds...');
['dist-chrome', 'dist-firefox', 'dist'].forEach(dir => {
  const dirPath = join(rootDir, dir);
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
});

// Generate icons first
console.log('🎨 Generating icons...');
execSync('./scripts/generate-icons.sh', { stdio: 'inherit', cwd: rootDir });

// Build for Chrome
console.log('\n📦 Building for Chrome...');
execSync('vue-tsc && vite build', { stdio: 'inherit', cwd: rootDir });

// Copy Chrome build to dist-chrome
console.log('📁 Moving Chrome build to dist-chrome...');
cpSync(join(rootDir, 'dist'), join(rootDir, 'dist-chrome'), { recursive: true });

// Clean dist directory for Firefox build
rmSync(join(rootDir, 'dist'), { recursive: true, force: true });

// Build for Firefox
console.log('\n📦 Building for Firefox...');

// Temporarily replace manifest.json with Firefox version
const originalManifest = readFileSync(join(rootDir, 'manifest.json'), 'utf-8');
const firefoxManifest = readFileSync(join(rootDir, 'manifest.firefox.json'), 'utf-8');

try {
  // Use Firefox manifest
  writeFileSync(join(rootDir, 'manifest.json'), firefoxManifest);
  
  // Run build
  execSync('vue-tsc && vite build', { stdio: 'inherit', cwd: rootDir });
  
  // Clean up Firefox-incompatible properties from the built manifest
  const builtManifestPath = join(rootDir, 'dist', 'manifest.json');
  const builtManifest = JSON.parse(readFileSync(builtManifestPath, 'utf-8'));
  
  // Remove Chrome-specific properties that Firefox doesn't support
  if (builtManifest.web_accessible_resources) {
    builtManifest.web_accessible_resources.forEach(resource => {
      delete resource.use_dynamic_url;
    });
  }
  
  // Write the cleaned manifest back
  writeFileSync(builtManifestPath, JSON.stringify(builtManifest, null, 2));
  
  // Copy Firefox build to dist-firefox
  console.log('📁 Moving Firefox build to dist-firefox...');
  cpSync(join(rootDir, 'dist'), join(rootDir, 'dist-firefox'), { recursive: true });
  
} finally {
  // Restore original manifest
  writeFileSync(join(rootDir, 'manifest.json'), originalManifest);
}

// Clean up temporary dist directory
rmSync(join(rootDir, 'dist'), { recursive: true, force: true });

console.log('\n✅ Build completed successfully!');
console.log('📁 Chrome extension: dist-chrome/');
console.log('📁 Firefox extension: dist-firefox/');
console.log('\n🔧 To load in browsers:');
console.log('   Chrome: Load unpacked from dist-chrome/');
console.log('   Firefox: Load temporary add-on from dist-firefox/');