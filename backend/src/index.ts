import 'dotenv/config';
import app from './app.js';
import { getPool } from './database/index.js';
import { runMigrations } from './database/migrations.js';

const PORT = Number(process.env.PORT) || 3001;

(async () => {
  // Verify DB connection and run schema migrations before accepting traffic
  await getPool();
  await runMigrations();

  app.listen(PORT, () => {
    console.log(`SplitEase API running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
})();
