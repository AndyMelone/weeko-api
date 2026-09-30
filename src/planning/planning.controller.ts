import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBaseSlotDto } from './dto/create-base-slot.dto';
import { PlaceDto } from './dto/place.dto';
import { PointerDto } from './dto/pointer.dto';
import { UpdatePrepDto } from './dto/update-prep.dto';
import { PlanningService } from './planning.service';

const DayPipe = new ParseIntPipe();

@Controller()
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('state')
  state() {
    return this.planning.state();
  }
  @Get('weeks/:week')
  week(@Param('week', ParseIntPipe) week: number) {
    return this.planning.week(week);
  }

  @Patch('weeks/:week/prep')
  updatePrep(
    @Param('week', ParseIntPipe) week: number,
    @Body() dto: UpdatePrepDto,
  ) {
    return this.planning.updatePrep(week, dto);
  }

  @Post('weeks/:week/preview')
  @HttpCode(200)
  preview(@Param('week', ParseIntPipe) week: number) {
    return this.planning.preview(week);
  }

  @Post('weeks/:week/generate')
  @HttpCode(200)
  generate(@Param('week', ParseIntPipe) week: number) {
    return this.planning.generate(week);
  }
  @Get('sessions')
  sessions(@Query('week', new ParseIntPipe({ optional: true })) week?: number) {
    return this.planning.sessions(week);
  }

  @Get('sessions/:id')
  session(@Param('id') id: string) {
    return this.planning.session(id);
  }

  @Post('sessions/:id/pointer')
  @HttpCode(200)
  pointer(@Param('id') id: string, @Body() dto: PointerDto) {
    return this.planning.pointer(id, dto);
  }

  @Get('sessions/:id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async ics(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { body, fileName } = await this.planning.ics(id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return body;
  }
  @Get('rattrapages')
  rattrapages() {
    return this.planning.rattrapages();
  }

  @Get('rattrapages/:key/proposals')
  proposals(@Param('key') key: string) {
    return this.planning.proposals(key);
  }

  @Get('rattrapages/:key/days/:day')
  day(@Param('key') key: string, @Param('day', DayPipe) day: number) {
    return this.planning.day(key, day);
  }

  @Post('rattrapages/:key/cancel')
  @HttpCode(200)
  cancel(@Param('key') key: string) {
    return this.planning.cancel(key);
  }

  @Post('rattrapages/:key/place')
  place(@Param('key') key: string, @Body() dto: PlaceDto) {
    return this.planning.place(key, dto);
  }
  @Get('base-slots')
  baseSlots() {
    return this.prisma.baseSlot.findMany({
      where: { service: { deletedAt: null } },
      orderBy: [{ day: 'asc' }, { start: 'asc' }],
    });
  }

  @Post('base-slots')
  createBaseSlot(@Body() dto: CreateBaseSlotDto) {
    return this.prisma.baseSlot.create({ data: dto });
  }

  @Delete('base-slots/:id')
  @HttpCode(204)
  async deleteBaseSlot(@Param('id') id: string) {
    const { count } = await this.prisma.baseSlot.deleteMany({ where: { id } });
    if (!count)
      throw new NotFoundException(`Créneau de base ${id} introuvable`);
  }
}
