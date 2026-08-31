import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind the nginx /api/* proxy (see apps/web/nginx.conf.template), Express only sees nginx's
  // IP unless it is told to trust the proxy. ThrottlerGuard keys its per-IP buckets on req.ip
  // (RedirectController, LinksController.create) - without this, every proxied request shares
  // one global bucket and one client can rate-limit everyone. '1' = trust exactly one proxy hop.
  app.set('trust proxy', 1);

  // Runs PrismaService.onModuleDestroy() (closes the DB connection cleanly) and every other
  // module's shutdown hook on SIGTERM/SIGINT - without this, NestJS never calls them at all, so
  // every container restart/redeploy risked leaving connections dangling instead of closing
  // them. Found missing entirely during a push-gate security-reviewer scope review.
  app.enableShutdownHooks();

  // Baseline security response headers (HSTS, X-Content-Type-Options, no X-Powered-By, etc.) -
  // found missing entirely during a push-gate security-reviewer scope review, added here.
  // Swagger UI at /api/docs needs its CSP relaxed (inline styles/scripts) to render, so the
  // default CSP is dropped in every non-production environment - which is exactly where /api/docs
  // is mounted (see the `!isProduction` block below). NOTE: env.validation.ts defaults NODE_ENV
  // to 'development' and @nestjs/config writes that default back into process.env, so a deploy
  // that does not explicitly set NODE_ENV=production runs WITHOUT CSP and with /api/docs exposed.
  // The provided apps/api/Dockerfile sets NODE_ENV=production; any other deploy path must too.
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  // Origins CORS accepts, from env (ALLOWED_ORIGINS - comma-separated, validated/defaulted in
  // config/env.validation.ts). Used to be hardcoded to the two localhost dev origins, which
  // would silently reject every request from a real deployed frontend domain.
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // No `credentials: true` - the API is Bearer-token only (no auth cookies), so allowing
  // credentialed cross-origin requests would only be a silent impact amplifier if the origin
  // allowlist were ever widened.
  app.enableCors({
    origin: allowedOrigins,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger/OpenAPI docs (Stage 8) - reads @ApiProperty/@ApiOperation/@ApiTags annotations on
  // DTOs and controllers. The docs UI/JSON itself has no auth control, so it's only mounted
  // outside production to avoid exposing the full API schema unauthenticated.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Link Shortener API')
      .setDescription(
        'Link shortening service with click analytics - see /links, /:code (public redirect), /links/:id/analytics, /auth',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  if (!isProduction) {
    console.log(`📚 API docs available at: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
