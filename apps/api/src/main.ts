import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for local frontend dev (Vite on :5173)
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
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
  // DTOs and controllers. Left enabled in all environments (including prod) since every
  // documented endpoint already enforces its own auth guard - the docs UI itself has no
  // separate access control, matching how NestJS's own quickstart sets it up.
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

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
