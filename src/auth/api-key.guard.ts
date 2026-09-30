import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator';

export const API_KEY_HEADER = 'x-api-key';

const digest = (v: string) => createHash('sha256').update(v).digest();

/** Exige l'en-tête x-api-key sur toutes les routes, sauf @Public(). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(private readonly reflector: Reflector) {
    const key = process.env.API_KEY;
    if (!key) throw new Error('API_KEY manquant (voir .env.example)');
    this.expected = digest(key);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);
    // Hachage des deux côtés : longueurs égales pour timingSafeEqual.
    if (!provided || !timingSafeEqual(digest(provided), this.expected)) {
      throw new UnauthorizedException('Clé API invalide ou absente');
    }
    return true;
  }
}
