#!/bin/bash

echo "Building trust-node..."
cd trust-node
cargo build --release
cd ..

echo "Building trust-client..."
cd trust-client
npm run build
cd ..

echo "Installing integration test dependencies..."
cd tests
npm install

echo "Running integration tests..."
npm test

echo "Cleaning up..."
npm run clean

echo "Done!"