import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { config } from './config'
import { HttpExceptionFilter } from './common/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalFilters(new HttpExceptionFilter())
  app.enableCors({ origin: true, credentials: true })
  app.enableShutdownHooks()
  await app.listen(config.port, '0.0.0.0')
  console.log(`FITBEST API 已启动：http://localhost:${config.port}`)
}

bootstrap()
