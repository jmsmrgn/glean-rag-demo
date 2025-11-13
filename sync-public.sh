#!/bin/bash
# Sync client files to public directory for Vercel deployment

echo "📁 Syncing client files to public directory..."
mkdir -p public
cp -r client/* public/
echo "✅ Files synced successfully!"

