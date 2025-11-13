#!/bin/bash

# ============================================================================
# Vercel Deployment Script for Glean RAG Demo
# ============================================================================
# This script automates deployment to Vercel including environment variables
# Usage: ./deploy.sh
# ============================================================================

set -e  # Exit on error

echo "🚀 Glean RAG Demo - Vercel Deployment"
echo "======================================"
echo ""

# Sync client files to public directory for Vercel
echo "📁 Syncing client files to public directory..."
./sync-public.sh
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found"
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found"
    echo "Using env.example as reference for required variables"
    echo ""
fi

# Load environment variables from .env if it exists
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
    echo "✅ Environment variables loaded"
    echo ""
fi

# Check for required environment variables
REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_KEY" "OPENAI_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "⚠️  Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please set these in your .env file or environment before deploying."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Initial deployment
echo "📦 Deploying to Vercel..."
echo ""
vercel --yes

echo ""
echo "✅ Initial deployment complete!"
echo ""

# Set environment variables in Vercel
if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo "🔧 Setting environment variables in Vercel..."
    echo ""

    # Set production environment variables
    if [ ! -z "$SUPABASE_URL" ]; then
        echo "Setting SUPABASE_URL..."
        echo "$SUPABASE_URL" | vercel env add SUPABASE_URL production || true
    fi

    if [ ! -z "$SUPABASE_KEY" ]; then
        echo "Setting SUPABASE_KEY..."
        echo "$SUPABASE_KEY" | vercel env add SUPABASE_KEY production || true
    fi

    if [ ! -z "$OPENAI_API_KEY" ]; then
        echo "Setting OPENAI_API_KEY..."
        echo "$OPENAI_API_KEY" | vercel env add OPENAI_API_KEY production || true
    fi

    if [ ! -z "$TAVILY_API_KEY" ]; then
        echo "Setting TAVILY_API_KEY (optional)..."
        echo "$TAVILY_API_KEY" | vercel env add TAVILY_API_KEY production || true
    fi

    echo ""
    echo "✅ Environment variables set!"
    echo ""

    # Deploy to production with env vars
    echo "🚀 Deploying to production..."
    vercel --prod --yes

    echo ""
    echo "✅ Production deployment complete!"
else
    echo "⚠️  Skipping environment variable setup (missing required vars)"
    echo ""
    echo "To set environment variables manually:"
    echo "  1. Go to https://vercel.com/dashboard"
    echo "  2. Select your project"
    echo "  3. Go to Settings → Environment Variables"
    echo "  4. Add: SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY"
    echo "  5. Run: vercel --prod"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Your app is live at the URL shown above."
echo "Share this URL with your call reviewer!"
echo ""

