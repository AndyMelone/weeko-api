import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { randomBytes } from 'node:crypto';
import { BlockDto, toBlocks } from '../planning/dto/block.dto';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateSettingsDto {
  /** Compter les trajets dans le planning. */
  @IsOptional()
  @IsBoolean()
  travel?: boolean;

  /** Indisponibilités du répétiteur (remplacent les précédentes). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockDto)
  unavailable?: BlockDto[];
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get() {
    return this.view();
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    const blocks = dto.unavailable && toBlocks(dto.unavailable);
    await this.prisma.$transaction(async (tx) => {
      if (dto.travel !== undefined) {
        await tx.settings.upsert({
          where: { id: 1 },
          create: { id: 1, travel: dto.travel },
          update: { travel: dto.travel },
        });
      }
      if (blocks) {
        await tx.unavailability.deleteMany({ where: { serviceId: null } });
        await tx.unavailability.createMany({
          data: blocks.map((b) => ({ ...b, serviceId: null })),
        });
      }
    });
    return this.view();
  }

  /** Crée (ou renouvelle) le jeton secret du flux agenda : l'ancien lien cesse de marcher. */
  @Post('calendar')
  @HttpCode(200)
  async calendar() {
    const calendarToken = randomBytes(24).toString('hex');
    await this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, calendarToken },
      update: { calendarToken },
    });
    return this.view();
  }

  private async view() {
    const [s, unavailable] = await Promise.all([
      this.prisma.settings.findUnique({ where: { id: 1 } }),
      this.prisma.unavailability.findMany({
        where: { serviceId: null },
        select: { day: true, start: true, end: true },
        orderBy: [{ day: 'asc' }, { start: 'asc' }],
      }),
    ]);
    return {
      travel: s?.travel ?? false,
      unavailable,
      calendarToken: s?.calendarToken ?? null,
    };
  }
}
