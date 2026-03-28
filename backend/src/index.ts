import 'dotenv/config';
import app from './app.js';
import { getDb } from './database/index.js';

const PORT = Number(process.env.PORT) || 3001;

// Eagerly initialize the DB so migration errors surface at startup
getDb();

app.listen(PORT, () => {
  console.log(`SplitEase API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
});
