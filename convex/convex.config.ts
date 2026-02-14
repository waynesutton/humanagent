import { defineApp } from "convex/server";
import auth from "@robelest/convex-auth/convex.config";

const app = defineApp();
app.use(auth);

// Note: Browser automation components (Firecrawl, Stagehand, Browser Use) are optional
// and require BYOK API keys. They are not installed as Convex components but rather
// used via their HTTP APIs with user-provided credentials stored in userCredentials.
// - Firecrawl: Requires FIRECRAWL_API_KEY in userCredentials
// - Stagehand/Browser Use: Requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in userCredentials

export default app;
