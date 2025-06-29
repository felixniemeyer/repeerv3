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

echo "📦 Linking dependencies to generic domain adapter..."
cd packages/website-adapters/generic-domain-adapter
npm link @repeer/adapter-interface @repeer/domain-domain
npm run build
npm link
cd ../../..

# Link all adapters to trust-client if it exists
if [ -d "trust-client" ]; then
    echo "📦 Linking adapters to trust-client..."
    cd trust-client
    npm link @repeer/adapter-interface @repeer/ethereum-domain @repeer/aliexpress-domain @repeer/domain-domain @repeer/etherscan-adapter @repeer/aliexpress-adapter @repeer/generic-domain-adapter
    cd ..
fi

# Link all adapters to browser-extension if it exists
if [ -d "browser-extension" ]; then
    echo "📦 Linking adapters to browser-extension..."
    cd browser-extension
    npm link @repeer/adapter-interface @repeer/ethereum-domain @repeer/aliexpress-domain @repeer/domain-domain @repeer/etherscan-adapter @repeer/aliexpress-adapter @repeer/generic-domain-adapter
    cd ..
fi

echo "✅ All packages relinked successfully!"
echo "🧪 You can now run tests in any package directory with: npm test"