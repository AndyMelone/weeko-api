import { IsInt, Max, Min, ValidateIf } from 'class-validator';

/** Soit l'index d'une proposition, soit un jour choisi à la main. */
export class PlaceDto {
  @ValidateIf((o: PlaceDto) => o.day === undefined)
  @IsInt()
  @Min(0)
  @Max(2)
  proposal?: number;

  @ValidateIf((o: PlaceDto) => o.proposal === undefined)
  @IsInt()
  @Min(0)
  @Max(6)
  day?: number;
}
