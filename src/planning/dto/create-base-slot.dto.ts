import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SessionKind } from '../../generated/prisma/enums';

export class CreateBaseSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  start: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  end: number;

  @IsString()
  svc: string;

  @IsOptional()
  @IsString()
  cls?: string;

  @IsOptional()
  @IsEnum(SessionKind)
  kind?: SessionKind;

  @IsOptional()
  @IsString()
  dueId?: string;

  @IsOptional()
  @IsBoolean()
  fixed?: boolean;
}
