import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningRepository } from './planning.repository';
import { PlanningService } from './planning.service';

@Module({
  controllers: [PlanningController],
  providers: [PlanningRepository, PlanningService],
  exports: [PlanningRepository],
})
export class PlanningModule {}
