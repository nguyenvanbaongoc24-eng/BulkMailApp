#!/usr/bin/env bash
# Optimized build script for Render

# Exit on error
set -e

echo "--- Starting Optimized Render Build ---"

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Setup Puppeteer Local Cache
# We use a project-relative directory so Render can cache it via render.yaml
export PUPPETEER_CACHE_DIR="$(pwd)/puppeteer_cache"
echo "Puppeteer Cache Directory: $PUPPETEER_CACHE_DIR"

if [ ! -d "$PUPPETEER_CACHE_DIR" ]; then
    echo "Creating cache directory..."
    mkdir -p "$PUPPETEER_CACHE_DIR"
fi

# 3. Handle Puppeteer Chromium Installation
# We check if chrome is already present in the cache
if [ -d "$PUPPETEER_CACHE_DIR/chrome" ]; then
    echo "✅ Puppeteer Chrome found in cache. Skipping download."
else
    echo "🚀 Puppeteer Chrome NOT found. Installing..."
    npx puppeteer browsers install chrome
fi

echo "--- Build Finished Successfully ---"
