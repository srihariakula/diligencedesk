/**
 * Loads .env for the CLI scripts (Next.js loads it for the web app; tsx does not).
 * Import first. A missing .env is fine: the free scripts run on defaults.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
