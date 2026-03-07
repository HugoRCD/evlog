import { Module } from '@nestjs/common'
import { EvlogModule } from 'evlog/nestjs'
import { createPostHogDrain } from 'evlog/posthog'
import { AppController } from './app.controller'

@Module({
  imports: [
    EvlogModule.forRoot({
      drain: createPostHogDrain(),
      enrich: (ctx) => {
        ctx.event.runtime = 'node'
        ctx.event.pid = process.pid
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
