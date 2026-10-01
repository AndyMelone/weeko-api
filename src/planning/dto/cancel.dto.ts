import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Who } from '../../generated/prisma/enums';

/** Annulation d'une séance prévue (absence prévenue). */
export class CancelDto {
  /** Créer une séance à rattraper. */
  @IsBoolean()
  redo: boolean;

  @IsOptional()
  @IsEnum(Who)
  who?: Who;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;
}
