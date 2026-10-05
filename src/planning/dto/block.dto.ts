import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { parseTime } from '../formats';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Plage indisponible : jour (0 = lundi), début et fin « HH:mm » (« 23:59 » = fin de journée). */
export class BlockDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  @Matches(HH_MM)
  start: string;

  @Matches(HH_MM)
  end: string;

  /** « ecole » : emploi du temps scolaire ; « autre » (défaut). */
  @IsOptional()
  @IsIn(['ecole', 'autre'])
  kind?: 'ecole' | 'autre';
}

export function toBlocks(list: BlockDto[]) {
  return list.map((b) => {
    const start = parseTime(b.start)!;
    const raw = parseTime(b.end)!;
    const end = raw >= 1439 ? 1440 : raw;
    if (end <= start)
      throw new BadRequestException(
        'Indisponibilité : la fin doit suivre le début',
      );
    return { day: b.day, start, end, kind: b.kind ?? 'autre' };
  });
}
