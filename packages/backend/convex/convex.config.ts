import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import polar from "@convex-dev/polar/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(migrations);
app.use(polar);
app.use(rateLimiter);

export default app;
