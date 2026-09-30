import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateSettingsDto {
  /** Compter les trajets dans le planning. */
  @IsOptional()
  @IsBoolean()
  travel?: boolean;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    return { travel: s?.travel ?? false };
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto) {
    const s = await this.prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
    return { travel: s.travel };
  }
}
