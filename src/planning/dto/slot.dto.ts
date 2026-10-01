import { IsInt, Max, Min } from 'class-validator';

/** Créneau précis : semaine (décalage), jour (0 = lundi), heures en minutes. */
export class SlotDto {
  @IsInt()
  @Min(-520)
  @Max(520)
  week: number;

  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  start: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  end: number;
}
