// Vercel API Route: /api/chat-websearch
import OpenAI from "openai";
import { tavily } from "@tavily/core";

export default async function handler(req, res) {
  // Initialize clients inside handler to ensure env vars are available
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const tavilyClient = process.env.TAVILY_API_KEY
    ? tavily({ apiKey: process.env.TAVILY_API_KEY })
    : null;
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
}

