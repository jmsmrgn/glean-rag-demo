// Vercel API Route: /api/health
export default function handler(req, res) {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasTavilyKey: !!process.env.TAVILY_API_KEY,
      isVercel: !!process.env.VERCEL,
      nodeVersion: process.version,
    },
  });
}

