import { handle } from "hono/vercel";
import { app } from "../server/app.ts";

export default handle(app);
