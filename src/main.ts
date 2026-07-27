import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { WsGateway } from './ws/ws.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const wsGateway = app.get(WsGateway);
  const httpServer = app.getHttpServer();
  wsGateway.attach(httpServer);

  console.log(`Server running on port ${port}`);
}
bootstrap();
