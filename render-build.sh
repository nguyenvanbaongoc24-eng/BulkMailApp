#!/usr/bin/env bash
# Render Build Script - Installs Chromium for Puppeteer

set -e

echo "📦 Installing Node dependencies..."
npm ci

echo "🌐 Installing Chromium for Puppeteer..."
npx puppeteer browsers install chrome

echo "✅ Build complete!"
