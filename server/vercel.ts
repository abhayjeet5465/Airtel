/** Vercel Function entry (Node runtime, Web Request/Response signature). Bundled by scripts/build-api.ts. */
import { handle } from "hono/vercel";
import { app } from "./app.ts";

const h = handle(app);
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
export const PATCH = h;
