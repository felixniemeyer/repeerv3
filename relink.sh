#!/bin/bash

# Relink all Repeer packages in dependency order
# Run this script from the v3 root directory

set -e

echo "🔗 Relinking Repeer packages..."

# Build and link leaf packages first (no dependencies)
echo "📦 Building and linking adapter interface..."
cd packages/adapter-interface
npm run build
npm link
cd ../..

echo "📦 Building and linking ID domain packages..."
cd packages/id-domains/ethereum-domain
npm run build
npm link
cd ../../..

cd packages/id-domains/aliexpress-domain
npm run build
npm link
cd ../../..

cd packages/id-domains/domain-domain
npm run build
npm link
cd ../../..

# Link dependencies to website adapters
echo "📦 Linking dependencies to etherscan adapter..."
cd packages/website-adapters/etherscan-adapter
npm link @repeer/adapter-interface @repeer/ethereum-domain
npm run build
npm link
cd ../../..

echo "📦 Linking dependencies to aliexpress adapter..."
cd packages/website-adapters/aliexpress-adapter
npm link @repeer/adapter-interface @repeer/aliexpress-domain
npm run build
npm link
cd ../../..

# Note: generic-domain-adapter removed - functionality moved to specific adapters

# Link all adapters to trust-client if it exists
if [ -d "trust-client" ]; then
    echo "📦 Linking adapters to trust-client..."
    cd trust-client
    npm link @repeer/adapter-interface @repeer/ethereum-domain @repeer/aliexpress-domain @repeer/domain-domain @repeer/etherscan-adapter @repeer/aliexpress-adapter
    cd ..
fi

# Link all adapters to browser-extension if it exists
if [ -d "browser-extension" ]; then
    echo "📦 Installing and linking adapters to browser-extension..."
    cd browser-extension
    npm install
    npm link @repeer/adapter-interface @repeer/ethereum-domain @repeer/aliexpress-domain @repeer/domain-domain @repeer/etherscan-adapter @repeer/aliexpress-adapter
    npm run build || echo "⚠️ Browser extension build failed, but continuing..."
    cd ..
fi

echo "✅ All packages relinked successfully!"
echo "🧪 You can now run tests in any package directory with: npm test"