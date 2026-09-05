import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

/**
 * Railway Infrastructure as Code for this project.
 *
 * One file describes the whole environment: the Postgres database, the app
 * service built from this GitHub repository, and the variables wiring them
 * together. Apply it with the Railway CLI:
 *
 *   railway login && railway link      # once per machine
 *   railway config plan                # preview
 *   railway config apply               # create/update resources
 *
 * Secrets are never written here: `preserve()` keeps whatever value is set in
 * Railway (dashboard, `railway variables set`, or the MCP), and the plan
 * output redacts values by default.
 *
 * To reuse this template for another app, change REPO, APP_NAME and REGION.
 */
const REPO = "ddewaele/railway-fullstack-template";
const APP_NAME = "app";
const REGION = "europe-west4"; // Amsterdam. See https://docs.railway.com/deployments/regions

export default defineRailway((ctx) => {
  const db = postgres("Postgres", { region: REGION });

  const app = service(APP_NAME, {
    source: github(REPO, { branch: "main" }),
    build: "pnpm build",
    start: "node apps/server/dist/index.js",
    // Runs between build and deploy with access to DATABASE_URL; a failing
    // migration aborts the deploy and keeps the previous version serving.
    preDeploy: "node apps/server/dist/migrate.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5 },
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // Public origin, used for the OAuth redirect URI. Set once the Railway
      // domain exists (generated domains are not part of the IaC file).
      APP_URL: preserve(),
      // Secrets: set in Railway, never in git.
      SESSION_SECRET: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
    },
  });

  return project(ctx.projectName ?? "railway-fullstack-template", {
    resources: [db, app],
  });
});
