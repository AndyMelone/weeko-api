import { PartialType } from '@nestjs/mapped-types';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  code?: string;

  /** « #RRGGBB » */
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsString()
  siteId: string;

  /** Séances par défaut dans la préparation d'une semaine. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  defaultCount?: number;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}
