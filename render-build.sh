#!/bin/bash
set -e

echo "==> Step 1: Removing old node_modules..."
rm -rf node_modules

echo "==> Step 2: Removing package-lock.json..."
rm -f package-lock.json

echo "==> Step 3: Installing all dependencies from scratch..."
npm install

echo "==> Step 4: Verifying mongoose installation..."
echo "Mongoose version:"
node -e "console.log(require('./node_modules/mongoose/package.json').version)"

echo "Checking drivers directory:"
ls -la node_modules/mongoose/lib/drivers/node-mongodb-native/ || echo "❌ DRIVERS DIRECTORY MISSING"

echo "==> Build complete ✅"
