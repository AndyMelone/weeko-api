import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Paiement reçu (FCFA). */
export class PaymentDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount: number;

  /** « YYYY-MM-DD » */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
