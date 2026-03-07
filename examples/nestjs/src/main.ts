import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { initLogger } from 'evlog'
import { AppModule } from './app.module'

initLogger({
  env: { service: 'nestjs-example' },
  pretty: true,
})

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3000)
  console.log('NestJS server started on http://localhost:3000')
}
bootstrap()
