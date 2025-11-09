// Vercel API Route: /api/chat
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("[STEP 0] Starting chat request");
    console.log("Environment check:", {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      supabaseUrlLength: process.env.SUPABASE_URL?.length,
      supabaseKeyLength: process.env.SUPABASE_KEY?.length,
      openaiKeyLength: process.env.OPENAI_API_KEY?.length,
    });

    // Check environment variables first
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_KEY ||
      !process.env.OPENAI_API_KEY
    ) {
      return res.status(500).json({
        error: "Environment variables missing",
        details: "Required API keys are not configured",
        env: {
          hasSupabaseUrl: !!process.env.SUPABASE_URL,
          hasSupabaseKey: !!process.env.SUPABASE_KEY,
          hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        },
      });
    }

    console.log("[STEP 1] Initializing clients");

    // Initialize clients inside handler
    let supabase, openai;
    try {
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );
      console.log("[STEP 1a] Supabase client created");
    } catch (error) {
      console.error("[ERROR] Supabase client creation failed:", error);
      return res.status(500).json({
        error: "Supabase initialization failed",
        details: error.message,
      });
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      console.log("[STEP 1b] OpenAI API key check:", {
        exists: !!apiKey,
        length: apiKey?.length,
        startsWithSk: apiKey?.startsWith("sk-"),
        hasWhitespace: apiKey !== process.env.OPENAI_API_KEY,
      });

      if (!apiKey || !apiKey.startsWith("sk-")) {
        return res.status(500).json({
          error: "Invalid OpenAI API key",
          details: "API key is missing or doesn't start with 'sk-'",
          keyInfo: {
            exists: !!apiKey,
            startsWithSk: apiKey?.startsWith("sk-"),
          },
        });
      }

      openai = new OpenAI({
        apiKey: apiKey,
      });
      console.log("[STEP 1b] OpenAI client created successfully");
    } catch (error) {
      console.error("[ERROR] OpenAI client creation failed:", error);
      return res.status(500).json({
        error: "OpenAI initialization failed",
        details: error.message,
      });
    }

    const { message } = req.body;
    console.log("[STEP 2] Message received, length:", message?.length);

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        details: "Message is required and must be a string",
      });
    }

    // Step 1: Convert query to vector
    console.log("[STEP 3] Creating embeddings via OpenAI");
    let embeddingResponse, queryEmbedding;
    try {
      console.log("[STEP 3a] Calling OpenAI embeddings API...");
      embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: message,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      console.log(
        "[STEP 3b] Embedding created, dimension:",
        queryEmbedding.length
      );
    } catch (error) {
      console.error("[ERROR] OpenAI embeddings failed:", error);
      console.error("[ERROR] Error type:", error.constructor.name);
      console.error("[ERROR] Error status:", error.status);
      console.error("[ERROR] Error code:", error.code);

      return res.status(500).json({
        error: "OpenAI embeddings failed",
        details: error.message,
        errorType: error.constructor.name,
        status: error.status,
        code: error.code,
        step: "embeddings",
      });
    }

    // Step 2: Find similar documents
    console.log("[STEP 4] Searching Supabase for similar documents");
    let matches, matchError;
    try {
      const result = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_count: 5,
      });
      matches = result.data;
      matchError = result.error;
      console.log(
        "[STEP 4] Supabase search complete, matches:",
        matches?.length
      );
    } catch (error) {
      console.error("[ERROR] Supabase RPC failed:", error);
      return res.status(500).json({
        error: "Supabase search failed",
        details: error.message,
        step: "vector_search",
      });
    }

    if (matchError) {
      console.error("[ERROR] Match error:", matchError);
      return res.status(500).json({
        error: "Document search failed",
        details: matchError.message || matchError,
        step: "match_documents",
      });
    }

    // Step 3: Build context
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

    // Step 4: Generate response
    console.log("[STEP 5] Generating response with OpenAI chat");
    let completion, assistantMessage;
    try {
      completion = await openai.chat.completions.create({
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
      assistantMessage = completion.choices[0].message.content;
      console.log(
        "[STEP 5] Response generated, length:",
        assistantMessage.length
      );
    } catch (error) {
      console.error("[ERROR] OpenAI chat completion failed:", error);
      return res.status(500).json({
        error: "OpenAI chat completion failed",
        details: error.message,
        step: "chat_completion",
      });
    }

    // Step 5: Return response with sources
    console.log("[STEP 6] Returning response to client");
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
    console.error("[ERROR] Unexpected error in chat handler:", error);
    console.error("[ERROR] Error name:", error.name);
    console.error("[ERROR] Error message:", error.message);
    console.error("[ERROR] Error stack:", error.stack);

    res.status(500).json({
      error: "Failed to process chat message",
      details: error.message,
      errorName: error.name,
      errorCode: error.code,
      step: "unknown",
      stack: error.stack,
    });
  }
}
