import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Séance de l'aperçu, éventuellement modifiée (jour, heures) dans l'app. */
export class WeekSessionDto {
  @IsString()
  @MaxLength(120)
  id: string;

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

  @IsString()
  svc: string;

  @IsOptional()
  @IsString()
  cls?: string | null;

  @IsIn(['normal', 'rattrapage'])
  kind: 'normal' | 'rattrapage';

  @IsOptional()
  @IsString()
  dueId?: string | null;

  @IsBoolean()
  fixed: boolean;

  @IsBoolean()
  base: boolean;
}

export class GenerateDto {
  /**
   * Aperçu validé tel quel (après modifications dans l'app). Absent : la
   * semaine est générée automatiquement.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WeekSessionDto)
  sessions?: WeekSessionDto[];
}
