import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { PlanningController } from './planning.controller';
import { PlanningRepository } from './planning.repository';
import { PlanningService } from './planning.service';

@Module({
  controllers: [PlanningController, CalendarController],
  providers: [PlanningRepository, PlanningService],
  exports: [PlanningRepository],
})
export class PlanningModule {}
