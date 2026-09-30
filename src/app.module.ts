import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApiKeyGuard } from './auth/api-key.guard';
import { PlanningModule } from './planning/planning.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsController } from './settings/settings.controller';
import { SitesModule } from './sites/sites.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [PrismaModule, PlanningModule, StudentsModule, SitesModule],
  controllers: [AppController, SettingsController],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
