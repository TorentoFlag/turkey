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
  listProducts(
    @Query('categorySlug') categorySlug?: string,
    @Query('destinationSlug') destinationSlug?: string,
  ) {
    return this.catalog.listPublicProducts(categorySlug, destinationSlug);
  }

  @Get('destinations')
  listDestinations() {
    return this.catalog.listPublicDestinations();
  }

  @Get('destinations/:slug')
  getDestination(@Param('slug') slug: string) {
    return this.catalog.getPublicDestination(slug);
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
