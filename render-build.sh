#!/usr/bin/env bash
# Optimized build script for Render
set -e

echo "--- Starting Optimized Render Build ---"

# 1. Setup Puppeteer Cache
# We enable Chromium download to support Quotation PDF generation.
# We use a specific cache directory to speed up future builds on Render.
export PUPPETEER_CACHE_DIR="$(pwd)/.puppeteer_cache"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
echo "✅ Puppeteer Chromium download ENABLED for Document Generation."

# 2. Setup Cache (Optional for NPM)
if [ ! -d "$PUPPETEER_CACHE_DIR" ]; then
    mkdir -p "$PUPPETEER_CACHE_DIR"
fi

# 3. Install dependencies (Production only)
echo "Installing production dependencies..."
npm ci --omit=dev

echo "--- Build Finished Successfully ---"
