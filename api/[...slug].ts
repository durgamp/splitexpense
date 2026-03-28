// Vercel serverless function — handles all /api/* requests
// Imports the Express app and initializes the DB on cold start.
import { getDb } from '../backend/src/database/index';
import app from '../backend/src/app';

getDb();

export default app;
