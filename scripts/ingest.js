// ============================================================================
// Glean RAG Assistant - Document Ingestion Module
// ============================================================================
// This module handles scraping, chunking, embedding, and storing documents
// from the Glean user guide into our Supabase vector database.
//
// The RAG (Retrieval Augmented Generation) pipeline has two phases:
// 1. INGESTION (this file): Load → Chunk → Embed → Store
// 2. RETRIEVAL (in server): Query → Find Similar → Augment → Generate
//
// This module handles phase 1.
// ============================================================================

import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

dotenv.config();

// Supabase client for vector storage
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// OpenAI client for generating embeddings (text → vector)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Automatically discovers all /user-guide/ pages by crawling the docs site
// Falls back to manual list if discovery fails

async function discoverUserGuideUrls() {
  try {
    console.log("Discovering /user-guide/ pages...");

    const baseUrl = "https://docs.glean.com";
    const startUrl = "https://docs.glean.com/user-guide/";
    const discoveredUrls = new Set();

    // Fetch the main user-guide page
    const response = await fetch(startUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract all links and filter for /user-guide/ pages
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      let url;
      if (href.startsWith("http")) {
        url = href;
      } else if (href.startsWith("/")) {
        url = baseUrl + href;
      } else {
        url = baseUrl + "/user-guide/" + href;
      }

      if (url.startsWith(baseUrl + "/user-guide/")) {
        const cleanUrl = url.split("#")[0].replace(/\/$/, "");
        if (cleanUrl !== baseUrl + "/user-guide") {
          discoveredUrls.add(cleanUrl);
        }
      }
    });

    const urls = Array.from(discoveredUrls).sort();

    console.log(`Found ${urls.length} pages`);

    return urls;
  } catch (error) {
    console.error("Discovery failed:", error.message);
    console.log("Falling back to manual list");

    return [
      "https://docs.glean.com/user-guide/about/what-is-glean",
      "https://docs.glean.com/user-guide/about/first-day-faqs",
      "https://docs.glean.com/user-guide/about/end-user-quick-start-guide",
      "https://docs.glean.com/user-guide/about/glean-for-engineering",
      "https://docs.glean.com/user-guide/about/glean-for-support",
      "https://docs.glean.com/user-guide/about/glean-for-sales",
      "https://docs.glean.com/user-guide/about/accessibility",
    ];
  }
}

// Main ingestion function: discovers URLs, scrapes content, generates embeddings, stores in DB
// Exported so it can be called from CLI script or API endpoint
export async function ingestDocuments() {
  try {
    console.log("Starting document ingestion...");

    const targetUrls = await discoverUserGuideUrls();

    console.log(`Loading content from ${targetUrls.length} URLs...`);

    let allDocs = [];

    // Scrape each URL using CheerioWebBaseLoader
    // Selector "#content" extracts only the main article text (no nav/headers/footers)
    for (let i = 0; i < targetUrls.length; i++) {
      const url = targetUrls[i];
      console.log(`[${i + 1}/${targetUrls.length}] Loading: ${url}`);

      try {
        const loader = new CheerioWebBaseLoader(url, {
          selector: "#content", // Main article div, excludes nav/headers/footers
        });

        const docs = await loader.load();

        if (docs.length > 0 && docs[0].pageContent) {
          let content = docs[0].pageContent;

          // Normalize whitespace
          content = content
            .replace(/\s+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          docs[0].pageContent = content;
          docs[0].metadata = {
            ...docs[0].metadata,
            source: url,
          };

          allDocs.push(docs[0]);
        } else {
          console.log(`   No content found for ${url}`);
        }
      } catch (error) {
        console.error(`   Error loading ${url}:`, error.message);
      }
    }

    console.log(`Successfully loaded ${allDocs.length} documents`);

    // Store full pages as chunks (no splitting) - preserves context, simpler citations
    // Tradeoff: larger chunks = fewer search results but complete context
    const chunks = allDocs;

    // Generate embeddings and store in database
    // Processing serially for simplicity - production would batch for performance
    console.log("Generating embeddings and storing in database...");

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding using text-embedding-3-small (1536 dimensions)
      // Similar text gets similar vectors, enabling semantic search
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk.pageContent,
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Store chunk with embedding and metadata (JSONB for flexibility)
      const { error } = await supabase.from("documents").insert({
        content: chunk.pageContent,
        embedding: embedding,
        metadata: {
          source: chunk.metadata.source,
          chunk_index: i,
          chunk_size: chunk.pageContent.length,
          scraped_at: new Date().toISOString(),
        },
      });

      if (error) {
        console.error(`Error storing chunk ${i + 1}:`, error);
        throw error;
      }
    }

    console.log(`Successfully ingested ${chunks.length} chunks`);

    return {
      success: true,
      chunksProcessed: chunks.length,
      documentsProcessed: allDocs.length,
      sources: targetUrls,
    };
  } catch (error) {
    console.error("Ingestion failed:", error);
    throw error;
  }
}
