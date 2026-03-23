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
# ❌ DISABLED: The web app no longer needs Chromium because scraping is handled locally by the Desktop App.
# This prevents the long download time that caused Render timeouts.
echo "✅ Scraping is handled locally by Desktop App. Skipping heavy Chromium download on Render."
# npx puppeteer browsers install chrome

echo "--- Build Finished Successfully ---"
