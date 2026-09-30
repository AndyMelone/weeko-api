import { Module } from '@nestjs/common';
import { PlanningModule } from '../planning/planning.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [PlanningModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
