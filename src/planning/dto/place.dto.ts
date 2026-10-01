import { Type } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { SlotDto } from './slot.dto';

/** Une proposition (index), un jour choisi à la main, ou un créneau précis. */
export class PlaceDto {
  @ValidateIf((o: PlaceDto) => o.day === undefined && o.slot === undefined)
  @IsInt()
  @Min(0)
  @Max(2)
  proposal?: number;

  @ValidateIf((o: PlaceDto) => o.proposal === undefined && o.slot === undefined)
  @IsInt()
  @Min(0)
  @Max(6)
  day?: number;

  @ValidateIf((o: PlaceDto) => o.proposal === undefined && o.day === undefined)
  @ValidateNested()
  @Type(() => SlotDto)
  slot?: SlotDto;
}
