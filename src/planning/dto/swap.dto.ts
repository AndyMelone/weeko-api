import { IsString, MaxLength } from 'class-validator';

/** Séance avec laquelle échanger jour et heures. */
export class SwapDto {
  @IsString()
  @MaxLength(120)
  with: string;
}
