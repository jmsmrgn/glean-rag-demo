# Quick Deployment to Vercel

## One-Command Deploy

```bash
npm run deploy
```

or

```bash
./deploy.sh
```

## What it does:

1. ✅ Syncs client files to `public/` directory (Vercel serves these as static files)
2. ✅ Checks for Vercel CLI (installs if missing)
3. ✅ Loads your `.env` file
4. ✅ Deploys to Vercel
5. ✅ Sets environment variables automatically
6. ✅ Deploys to production

## How it works:

Vercel automatically detects the Express app from `index.js` in the root directory:
- **Static files** (HTML, CSS, JS) are served from the `/public` directory
- **API routes** are handled by the Express app exported from `index.js`
- Vercel converts your Express app into a single serverless function

The `sync-public.sh` script copies files from `/client` to `/public` before deployment.

## Required Environment Variables

Make sure these are in your `.env` file:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `TAVILY_API_KEY` (optional)

## First Time Setup

If you haven't used Vercel CLI before:

```bash
vercel login
```

Then run the deploy script!

## Manual Environment Variables

If the script can't set env vars automatically, go to:

1. https://vercel.com/dashboard
2. Select your project
3. Settings → Environment Variables
4. Add the required variables
5. Run `vercel --prod`

## After Deployment

Share the production URL with your reviewer! It will look like:

`https://glean-rag-demo-xyz123.vercel.app`

The app will be live and fully functional for the demo call.

