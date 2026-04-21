#!/usr/bin/env bash
# Optimized build script for Render
set -e

echo "--- Starting Optimized Render Build ---"

# 1. Setup Puppeteer Skip
# ❌ DISABLED: The web app no longer needs Chromium because scraping is handled locally by the Desktop App.
# This prevents the long download time that caused Render timeouts.
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
echo "✅ Scraping matches local Desktop App policy. Skipping heavy Chromium download on Render."

# 2. Setup Cache (Optional for NPM)
export PUPPETEER_CACHE_DIR="$(pwd)/puppeteer_cache"
if [ ! -d "$PUPPETEER_CACHE_DIR" ]; then
    mkdir -p "$PUPPETEER_CACHE_DIR"
fi

# 3. Install dependencies (Production only)
echo "Installing production dependencies..."
npm ci --omit=dev

echo "--- Build Finished Successfully ---"
