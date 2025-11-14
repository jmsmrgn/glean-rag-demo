# Glean RAG Assistant

A prototype demonstrating a Retrieval Augmented Generation (RAG) system for Glean documentation. Scrapes content from Glean's user guide, stores it with vector embeddings in Supabase, and provides context-aware responses through OpenAI.

## Overview

This implements a complete RAG pipeline:

1. **Ingestion**: Scrape Glean docs → chunk text → generate embeddings → store in vector database
2. **Query**: User question → embed → similarity search → augment prompt → generate response

### Three-Mode Comparison

The app includes three modes to demonstrate RAG value:

- **Basic**: Pure OpenAI (training data only)
- **Web Search**: OpenAI + Tavily web search
- **RAG**: OpenAI + internal documentation

This side-by-side comparison shows why RAG outperforms alternatives for internal knowledge.

## Tech Stack

- **Backend**: Express.js, Supabase (PostgreSQL + pgvector)
- **AI**: OpenAI (text-embedding-3-small, gpt-4o-mini)
- **Frontend**: React via CDN (no build step)
- **Scraping**: LangChain + Cheerio

## Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- OpenAI API key with credits
- Tavily API key (optional, for web search mode)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `supabase/schema.sql`
3. Get your Project URL and API key from Settings → API

### 3. Set Environment Variables

Copy `env.example` to `.env` and fill in:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key
OPENAI_API_KEY=sk-your-key
TAVILY_API_KEY=tvly-your-key  # optional
PORT=3000
```

### 4. Ingest Documentation

```bash
npm run ingest
```

This scrapes Glean docs, generates embeddings, and stores them in Supabase. Takes 1-2 minutes.

### 5. Start Server

```bash
npm start
```

Open http://localhost:3000

## Usage

### Chat Interface

Type questions about Glean in the input field. Switch between the three modes (Basic, Web Search, RAG) to compare responses.

Example questions:

- "What is Glean?"
- "How does Glean help support teams?"
- "What are Glean's key features?"

### API Endpoints

**POST /api/chat** - RAG mode with internal docs

```json
{
  "message": "What is Glean?"
}
```

**POST /api/chat-basic** - No RAG, training data only

**POST /api/chat-websearch** - With web search

**POST /api/ingest** - Trigger document ingestion

**GET /api/health** - Health check

## Project Structure

```
glean-rag-assistant/
├── client/
│   ├── index.html         # HTML structure
│   ├── styles.css         # All CSS
│   └── app.js             # React app
├── server/
│   └── index.js           # Express + API endpoints
├── scripts/
│   ├── ingest.js          # Ingestion logic
│   └── run-ingest.js      # CLI wrapper
├── supabase/
│   └── schema.sql         # Database schema
├── package.json
└── .env                   # Your credentials
```

## Design Decisions

**JavaScript over TypeScript**: Faster prototyping, simpler to explain. Production would use TypeScript.

**React via CDN**: No build step, instant iteration. Production would use Vite/Next.js.

**Supabase + pgvector**: Familiar PostgreSQL, generous free tier, avoids vendor lock-in. Scales to millions of documents.

**Full pages vs chunks**: Glean docs are 1-3K words each. Storing full pages preserves context and simplifies citations. Larger documents would require chunking.

**Three comparison modes**: Most RAG demos only show RAG. This demonstrates value through direct comparison.

## Production Considerations

This is a prototype. Production would add:

- Authentication and authorization
- Input validation and rate limiting
- Caching (Redis for queries)
- Error handling and monitoring
- Testing (unit, integration, e2e)
- CI/CD pipeline
- Database optimization (read replicas, partitioning)
- Streaming responses
- Conversation history
- Cost monitoring and limits

## Troubleshooting

**Ingestion fails**: Check `.env` has valid `OPENAI_API_KEY` and you have credits

**"Failed to search documents"**: Verify Supabase credentials and that `schema.sql` was run

**Generic responses**: Confirm ingestion completed and `documents` table has data

**Server won't start**: Check port 3000 isn't in use, try changing `PORT` in `.env`

## License

MIT

---

**Note**: This is a prototype for demonstration purposes. Not production-ready without significant security, testing, and scalability enhancements.
