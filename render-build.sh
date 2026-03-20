#!/usr/bin/env bash
# Optimized build script for Render
set -e

echo "--- Starting Optimized Render Build ---"

# 1. Setup Puppeteer Local Cache
# Path MUST match render.yaml mountPath
export PUPPETEER_CACHE_DIR="$(pwd)/puppeteer_cache"
echo "Puppeteer Cache Directory: $PUPPETEER_CACHE_DIR"

if [ ! -d "$PUPPETEER_CACHE_DIR" ]; then
    echo "Creating cache directory..."
    mkdir -p "$PUPPETEER_CACHE_DIR"
fi

# 2. Install dependencies (Production only)
echo "Installing production dependencies..."
# Skip chromium download during npm install to avoid duplicate/heavy downloads
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm ci --omit=dev

# 3. Handle Puppeteer Chromium Installation
# We check if chrome is already present in the persistent disk cache
# Look for the internal structure of puppeteer chrome installation
if [ -d "$PUPPETEER_CACHE_DIR/chrome" ]; then
    echo "✅ Puppeteer Chrome found in cache. Skipping download."
else
    echo "🚀 Puppeteer Chrome NOT found. Installing to $PUPPETEER_CACHE_DIR..."
    npx puppeteer browsers install chrome
fi

echo "--- Build Finished Successfully ---"
