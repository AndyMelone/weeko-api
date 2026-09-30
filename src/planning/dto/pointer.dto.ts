import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Who } from '../../generated/prisma/enums';

export class PointerDto {
  @IsBoolean()
  missed: boolean;

  /** Qui était absent : requis si la séance est manquée et à rattraper. */
  @ValidateIf((o: PointerDto) => o.missed && o.redo !== false)
  @IsEnum(Who)
  who?: Who;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;

  /** À rattraper (par défaut : oui). */
  @IsOptional()
  @IsBoolean()
  redo?: boolean;
}
