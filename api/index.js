// Vercel API Route handler that uses the Express app
import app from '../index.js';

// Vercel expects a handler function for API routes
export default (req, res) => {
  // Let Express handle the request
  app(req, res);
};

