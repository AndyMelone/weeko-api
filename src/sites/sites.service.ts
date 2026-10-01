import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateClassDto,
  CreateSiteDto,
  UpdateClassDto,
  UpdateSiteDto,
} from './dto/site.dto';

const DEFAULT_SITE_COLOR = '#5980A6';

/** Sites Succès Group et leurs classes. */
@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  listSites() {
    return this.prisma.service.findMany({
      where: { kind: 'site', deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        classes: {
          where: { deletedAt: null },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
        },
      },
    });
  }

  async createSite(dto: CreateSiteDto) {
    const name = dto.name.trim();
    const last = await this.prisma.service.aggregate({
      _max: { position: true },
    });
    return this.prisma.service.create({
      data: {
        name,
        first: name,
        code: (dto.code ?? name.slice(0, 2)).toUpperCase(),
        color: dto.color ?? DEFAULT_SITE_COLOR,
        kind: 'site',
        position: (last._max.position ?? 0) + 1,
      },
      include: { classes: true },
    });
  }

  async updateSite(id: string, dto: UpdateSiteDto) {
    await this.ensureSite(id);
    const name = dto.name?.trim();
    return this.prisma.service.update({
      where: { id },
      data: {
        ...(name && { name, first: name }),
        ...(dto.code && { code: dto.code.toUpperCase() }),
        ...(dto.color && { color: dto.color }),
      },
      include: { classes: true },
    });
  }

  /** Suppression douce : le site disparaît du planning, son historique est conservé. */
  async removeSite(id: string) {
    await this.ensureSite(id);
    await this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  listClasses() {
    return this.prisma.schoolClass.findMany({
      where: { deletedAt: null, site: { deletedAt: null } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async createClass(dto: CreateClassDto) {
    await this.ensureSite(dto.siteId, BadRequestException);
    const last = await this.prisma.schoolClass.aggregate({
      _max: { position: true },
    });
    return this.prisma.schoolClass.create({
      data: {
        ...dto,
        name: dto.name.trim(),
        position: (last._max.position ?? 0) + 1,
      },
    });
  }

  async updateClass(id: string, dto: UpdateClassDto) {
    await this.ensureClass(id);
    if (dto.siteId) await this.ensureSite(dto.siteId, BadRequestException);
    return this.prisma.schoolClass.update({
      where: { id },
      data: { ...dto, name: dto.name?.trim() },
    });
  }

  /** Suppression douce : la classe disparaît du planning, son historique est conservé. */
  async removeClass(id: string) {
    await this.ensureClass(id);
    await this.prisma.schoolClass.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureSite(
    id: string,
    Err: new (msg: string) => Error = NotFoundException,
  ) {
    const s = await this.prisma.service.findUnique({
      where: { id },
      select: { kind: true, deletedAt: true },
    });
    if (!s || s.kind !== 'site' || s.deletedAt)
      throw new Err(`Site ${id} introuvable`);
  }

  private async ensureClass(id: string) {
    const c = await this.prisma.schoolClass.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (!c || c.deletedAt)
      throw new NotFoundException(`Classe ${id} introuvable`);
  }
}
