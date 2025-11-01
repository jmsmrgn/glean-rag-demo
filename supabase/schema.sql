-- ============================================================================
-- Glean RAG Assistant - Supabase Database Schema
-- ============================================================================

-- Enable pgvector extension for vector storage and similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table: stores text content with embeddings for semantic search
-- - UUID: better for distributed systems
-- - JSONB metadata: flexible schema for source URLs, timestamps, etc
-- - vector(1536): matches OpenAI text-embedding-3-small output size
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  metadata JSONB,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector index for fast similarity search using cosine distance
-- IVFFlat with 100 lists is good for small-medium datasets
-- For production scale (>100k docs), consider HNSW index
CREATE INDEX IF NOT EXISTS documents_embedding_idx
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Similarity search function: returns top N most similar documents
-- Takes query vector, returns documents with similarity scores (0-1, higher=more similar)
-- The <=> operator calculates cosine distance, we convert to similarity (1 - distance)
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

