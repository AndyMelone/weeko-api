import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { BlockDto } from '../../planning/dto/block.dto';

const HH_MM = /^(|([01]\d|2[0-3]):[0-5]\d)$/;

export class FixedDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  /** Heure de début « HH:mm ». */
  @Matches(HH_MM)
  time: string;
}

/** Formulaire « Nouvel élève » de l'app. */
export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Séances de 2 h par semaine. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  count?: number;

  /** Jours exclus (0 = lundi). Samedi + dimanche = jamais le week-end. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  exDays?: number[];

  @IsOptional()
  @Matches(HH_MM)
  notBefore?: string;

  @IsOptional()
  @Matches(HH_MM)
  notAfter?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FixedDayDto)
  fixed?: FixedDayDto[];

  /** Plages indisponibles (remplacent les précédentes). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockDto)
  unavailable?: BlockDto[];

  /** Tarif en FCFA (null = aucun). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  rate?: number | null;

  /** « seance » : par séance faite ; « mois » : forfait mensuel. */
  @IsOptional()
  @IsIn(['seance', 'mois'])
  billing?: 'seance' | 'mois';
}
