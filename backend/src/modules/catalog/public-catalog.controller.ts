import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

@Controller('v1/public')
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  listCategories() {
    return this.catalog.listPublicCategories();
  }

  @Get('products')
  listProducts(@Query('categorySlug') categorySlug?: string) {
    return this.catalog.listPublicProducts(categorySlug);
  }

  @Get('catalog-health')
  getCatalogHealth() {
    return this.catalog.getPublicCatalogHealth();
  }

  @Get('products/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getPublicProduct(slug);
  }
}
