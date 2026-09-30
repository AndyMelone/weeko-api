import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateClassDto,
  CreateSiteDto,
  UpdateClassDto,
  UpdateSiteDto,
} from './dto/site.dto';
import { SitesService } from './sites.service';

@Controller()
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get('sites')
  listSites() {
    return this.sites.listSites();
  }

  @Post('sites')
  createSite(@Body() dto: CreateSiteDto) {
    return this.sites.createSite(dto);
  }

  @Patch('sites/:id')
  updateSite(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.updateSite(id, dto);
  }

  @Delete('sites/:id')
  @HttpCode(204)
  removeSite(@Param('id') id: string) {
    return this.sites.removeSite(id);
  }

  @Get('classes')
  listClasses() {
    return this.sites.listClasses();
  }

  @Post('classes')
  createClass(@Body() dto: CreateClassDto) {
    return this.sites.createClass(dto);
  }

  @Patch('classes/:id')
  updateClass(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.sites.updateClass(id, dto);
  }

  @Delete('classes/:id')
  @HttpCode(204)
  removeClass(@Param('id') id: string) {
    return this.sites.removeClass(id);
  }
}
