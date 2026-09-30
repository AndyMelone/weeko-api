import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Route accessible sans clé API. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
