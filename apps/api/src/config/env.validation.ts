import * as Joi from 'joi';

// Validated once at boot via ConfigModule.forRoot({ validate }) - a missing or malformed env
// var fails the app IMMEDIATELY with a clear message naming the exact variable, instead of
// surfacing later as a confusing runtime error the first time that variable is actually read
// (which is what happened before this existed - e.g. GOOGLE_CALLBACK_URL being blank would only
// break once someone actually clicked "Sign in with Google"). Same principle jwt-secret.ts
// already applies to JWT_SECRET alone - this generalizes it to every env var the app depends on.
//
// GOOGLE_CLIENT_ID/SECRET are intentionally NOT required here even though auth.module.ts needs
// them to actually work - see google.strategy.ts's own placeholder-credential fallback, which is
// a deliberate product decision (don't crash the whole app over a Google Cloud setup step Claude
// Code can't do on someone's behalf). Enforcing them here would fight that decision.
//
// JWT_SECRET is intentionally NOT validated here either - jwt-secret.ts's getRequiredJwtSecret()
// is the single source of truth for it already (its own comment says so explicitly), with a
// specific, actionable error message ("generate one: node -e ..."). Adding a second, competing
// `.required()` check here would either duplicate that message or - worse - fire first with
// Joi's generic, less helpful one, since ConfigModule validates before AuthModule's factories
// ever run.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  GOOGLE_CALLBACK_URL: Joi.string()
    .uri()
    .default('http://localhost:4000/auth/google/callback'),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  // Comma-separated list of origins CORS will accept, e.g.
  // "https://app.example.com,https://example.com" - see main.ts. Defaults to the two localhost
  // dev origins so nothing extra is required for local development.
  ALLOWED_ORIGINS: Joi.string().default(
    'http://localhost:5173,http://localhost:3000',
  ),
}).unknown(true); // don't reject unrelated env vars the host/CI/shell happens to set
