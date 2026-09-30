import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  Matches,
} from 'class-validator';
import type { ClassTime, WeekChange } from '../planner';

export class UpdatePrepDto {
  /** Heure de sortie du travail lun.–ven., « HH:mm » ou vide. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @Matches(/^(|([01]\d|2[0-3]):[0-5]\d)$/, {
    each: true,
    message: 'off doit contenir des heures « HH:mm » ou ""',
  })
  off?: string[];

  /** Classe → nombre de séances Succès Group. */
  @IsOptional()
  @IsObject()
  counts?: Record<string, number>;

  /** Classe → créneaux Succès Group [{ day, start, end }] (minutes). */
  @IsOptional()
  @IsObject()
  times?: Record<string, ClassTime[]>;

  /** Élève → « normal » | « une » | « absent ». */
  @IsOptional()
  @IsObject()
  changes?: Record<string, WeekChange>;

  /** Séance due → incluse. */
  @IsOptional()
  @IsObject()
  include?: Record<string, boolean>;
}
