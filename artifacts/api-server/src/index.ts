process.env.TZ = "Asia/Riyadh";

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedDatabase } from "./lib/seed.js";
import { startReportScheduler } from "./lib/reports.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await seedDatabase();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

startReportScheduler();
