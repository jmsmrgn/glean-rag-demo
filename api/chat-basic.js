// Vercel API Route: /api/chat-basic
import OpenAI from "openai";

export default async function handler(req, res) {
  // Initialize client inside handler to ensure env vars are available
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
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
}

