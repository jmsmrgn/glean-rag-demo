// ============================================================================
// Glean RAG Assistant - Express Server
// ============================================================================
// Serves React frontend and provides API endpoints for:
// 1. Document ingestion (scrape → embed → store)
// 2. Three chat modes: Basic (pure LLM), Web Search, and RAG (internal docs)
//
// Architecture: Express + CDN React (no build step for prototype simplicity)
// Production would add: TypeScript, validation, auth, rate limiting, logging
// ============================================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { tavily } from "@tavily/core";
import { ingestDocuments } from "./scripts/ingest.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ES modules don't have __dirname - derive it from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_KEY", "OPENAI_API_KEY"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  console.error("Please set these in your Vercel dashboard or .env file");
}

// Supabase client for vector search
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

// OpenAI client for embeddings and completions
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Tavily client for web search (optional)
const tavilyClient = process.env.TAVILY_API_KEY
  ? tavily({ apiKey: process.env.TAVILY_API_KEY })
  : null;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Cross-origin requests
app.use(express.json()); // Parse JSON bodies

// Serve frontend only in local development (not on Vercel)
// On Vercel, static files are automatically served from /public directory
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "client")));
}

// ============================================================================
// API Endpoint: POST /api/ingest
// ============================================================================
// Triggers document ingestion: scrape → embed → store in vector DB
// Useful for demos and can be triggered via webhooks when docs update
// Production: add auth, rate limiting, async job queue
// ============================================================================

app.post("/api/ingest", async (req, res) => {
  try {
    const result = await ingestDocuments();

    res.json({
      success: true,
      message: "Documents ingested successfully",
      ...result,
    });
  } catch (error) {
    console.error("Ingestion error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to ingest documents",
      details: error.message,
    });
  }
});

// ============================================================================
// API Endpoint: POST /api/chat (RAG Mode)
// ============================================================================
// Main RAG pipeline: Query → Embed → Retrieve → Augment → Generate
// Returns LLM response grounded in internal docs with source citations
// ============================================================================

app.post("/api/chat", async (req, res) => {
  try {
    // Check if required clients are initialized
    if (!openai || !supabase) {
      return res.status(500).json({
        error: "Service configuration error",
        details:
          "Required API clients are not properly configured. Please check environment variables.",
        missingClients: {
          openai: !openai,
          supabase: !supabase,
        },
      });
    }

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        details: "Message is required and must be a string",
      });
    }

    // Step 1: Convert query to vector (same model as ingestion: text-embedding-3-small)
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Step 2: Find top 5 similar documents via vector search
    // 5 is a balance: too few misses context, too many adds noise
    const { data: matches, error: matchError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
      }
    );

    if (matchError) {
      console.error("Match error:", matchError);
      throw new Error("Failed to search documents");
    }

    // Step 3: Build context from retrieved documents
    let context = "";
    if (matches && matches.length > 0) {
      context = matches
        .map((match, index) => {
          return `[Source ${index + 1}]:\n${match.content}\n`;
        })
        .join("\n---\n\n");
    } else {
      context = "No relevant information found in the knowledge base.";
    }

    // Step 4: Generate response with context-augmented prompt
    // Using gpt-4o-mini for speed and cost efficiency
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for Glean, a work AI platform.

Your role is to answer questions about Glean based on the provided context from the Glean documentation.

IMPORTANT INSTRUCTIONS:
- Base your answers primarily on the provided context
- If the context contains relevant information, use it to give a comprehensive answer
- If the context doesn't contain enough information, say so honestly
- Be conversational and helpful, but accurate
- When relevant, you can mention that Glean's search and AI features can help with the user's question
- Format your response in markdown with clear paragraphs, lists, and formatting
- You may reference specific features or concepts by name (e.g., "As mentioned in the Glean user guide...")

CONTEXT FROM GLEAN DOCUMENTATION:
${context}`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const assistantMessage = completion.choices[0].message.content;

    // Step 5: Return response with source citations
    res.json({
      response: assistantMessage,
      sources:
        matches?.map((match) => ({
          content: match.content,
          similarity: match.similarity,
          metadata: match.metadata,
        })) || [],
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Failed to process chat message",
      details: error.message,
    });
  }
});

// ============================================================================
// API Endpoint: POST /api/chat-basic (No RAG)
// ============================================================================
// Pure OpenAI responses without augmentation - for comparison demos
// ============================================================================

app.post("/api/chat-basic", async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({
        error: "Service configuration error",
        details:
          "OpenAI client not configured. Please check OPENAI_API_KEY environment variable.",
      });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant. Answer questions to the best of your ability based on your training data only.

Be honest if you don't have specific information. Do not make up details.`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const assistantMessage = completion.choices[0].message.content;

    res.json({
      response: assistantMessage,
      sources: [],
    });
  } catch (error) {
    console.error("Basic chat error:", error);
    res.status(500).json({
      error: "Failed to process chat message",
      details: error.message,
    });
  }
});

// ============================================================================
// API Endpoint: POST /api/chat-websearch (Web Search Mode)
// ============================================================================
// Uses Tavily API for web search + OpenAI - for comparison with RAG
// ============================================================================

app.post("/api/chat-websearch", async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({
        error: "Service configuration error",
        details:
          "OpenAI client not configured. Please check OPENAI_API_KEY environment variable.",
      });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let webContext = "";
    let searchSources = [];

    if (tavilyClient) {
      try {
        const searchResults = await tavilyClient.search(message, {
          maxResults: 3,
          searchDepth: "basic",
          includeAnswer: false,
        });

        if (searchResults?.results?.length > 0) {
          webContext = searchResults.results
            .map(
              (result, idx) =>
                `[${idx + 1}] ${result.title}\n${result.content}\nSource: ${
                  result.url
                }\n`
            )
            .join("\n");

          searchSources = searchResults.results.map((result) => ({
            content: result.content.slice(0, 200) + "...",
            similarity: 1,
            metadata: {
              source: result.url,
              title: result.title,
            },
          }));
        }
      } catch (searchError) {
        console.error("Web search failed:", searchError.message);
      }
    } else {
      return res.status(400).json({
        error: "Web search not configured",
        details: "Tavily API key is required for web search mode",
      });
    }

    const systemPrompt = `You are a helpful assistant specializing in Glean.com user guides. Answer questions based on the web search results provided below, using information exclusively from https://docs.glean.com/user-guide/ and its subpages.

WEB SEARCH RESULTS:
${webContext}

Use the information from these search results to provide an accurate, helpful answer. Cite sources when mentioning specific information.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const assistantMessage = completion.choices[0].message.content;

    res.json({
      response: assistantMessage,
      sources: searchSources,
    });
  } catch (error) {
    console.error("Web search chat error:", error);
    res.status(500).json({
      error: "Failed to process chat message",
      details: error.message,
    });
  }
});

// Health check endpoint
// Production would check database connectivity, API status, etc.

app.get("/api/health", (req, res) => {
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
});

// Start server for local development
if (!process.env.VERCEL && process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log("\nGlean RAG Assistant Server");
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("\nAPI Endpoints:");
    console.log("  POST /api/ingest        - Ingest documents");
    console.log("  POST /api/chat          - Chat with RAG (internal docs)");
    console.log("  POST /api/chat-websearch - Chat with web search");
    console.log("  POST /api/chat-basic    - Chat basic (training data only)");
    console.log("  GET  /api/health        - Health check");
    console.log(`\nFrontend: http://localhost:${PORT}\n`);
  });
}

// Export the Express app (Vercel pattern)
export default app;
