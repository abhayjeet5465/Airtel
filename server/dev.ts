import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";

if (existsSync(".env")) process.loadEnvFile(".env");
const { app } = await import("./app.ts");

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Udyam Digital API on http://localhost:${port}/api`));
