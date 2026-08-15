import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CatalogProtocolService,
  type ProtocolResponse,
} from './catalog-protocol.service.js';
import {
  CatalogProtocolError,
  parseExpectedRevision,
  toCatalogProblem,
} from './catalog-protocol.schemas.js';
import { ProtocolActor, ProtocolAuthGuard } from './protocol-auth.guard.js';
import type { AuthenticatedProtocolActor } from './protocol-auth.js';

@Catch()
class CatalogProtocolExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const problem = toCatalogProblem(exception);
    void reply
      .type('application/problem+json')
      .status(problem.status)
      .send(problem.body);
  }
}

@Controller('admin/integration/catalog/v1')
@UseGuards(ProtocolAuthGuard)
@UseFilters(CatalogProtocolExceptionFilter)
export class CatalogProtocolController {
  constructor(private readonly catalog: CatalogProtocolService) {}

  @Get('capabilities')
  getCapabilities() {
    return this.catalog.getCapabilities();
  }

  @Get('categories')
  listCategories(@Query() query: Record<string, string | undefined>) {
    return this.catalog.listCategories(query);
  }

  @Post('categories')
  createCategory(
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.createCategory({ actor, request }, body),
    );
  }

  @Get('categories/:id')
  getCategory(
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.catalog.getCategory(id));
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.updateCategory(
        { actor, request },
        id,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Delete('categories/:id')
  deleteCategory(
    @Param('id') id: string,
    @Query('dryRun') dryRun: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.deleteResource(
        { actor, request },
        'category',
        id,
        parseExpectedRevision(ifMatch),
        parseDryRun(dryRun),
      ),
    );
  }

  @Get('products')
  listProducts(@Query() query: Record<string, string | undefined>) {
    return this.catalog.listProducts(query);
  }

  @Post('products')
  createProduct(
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.createProduct({ actor, request }, body),
    );
  }

  @Get('products/:id')
  getProduct(
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.catalog.getProduct(id));
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.updateProduct(
        { actor, request },
        id,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Delete('products/:id')
  deleteProduct(
    @Param('id') id: string,
    @Query('dryRun') dryRun: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.deleteResource(
        { actor, request },
        'product',
        id,
        parseExpectedRevision(ifMatch),
        parseDryRun(dryRun),
      ),
    );
  }

  @Get('offers')
  listOffers(@Query() query: Record<string, string | undefined>) {
    return this.catalog.listOffers(query);
  }

  @Post('offers')
  createOffer(
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.catalog.createOffer({ actor, request }));
  }

  @Get('offers/:id')
  getOffer(
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.catalog.getOffer(id));
  }

  @Patch('offers/:id')
  updateOffer(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.updateOffer(
        { actor, request },
        id,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Delete('offers/:id')
  deleteOffer(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.deleteOffer(
        { actor, request },
        id,
        parseExpectedRevision(ifMatch),
      ),
    );
  }

  @Get('destinations')
  listDestinations(@Query() query: Record<string, string | undefined>) {
    return this.catalog.listDestinations(query);
  }

  @Post('destinations')
  createDestination(
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.createDestination({ actor, request }, body),
    );
  }

  @Get('destinations/:id')
  getDestination(
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.catalog.getDestination(id));
  }

  @Patch('destinations/:id')
  updateDestination(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.updateDestination(
        { actor, request },
        id,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Delete('destinations/:id')
  deleteDestination(
    @Param('id') id: string,
    @Query('dryRun') dryRun: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.deleteResource(
        { actor, request },
        'destination',
        id,
        parseExpectedRevision(ifMatch),
        parseDryRun(dryRun),
      ),
    );
  }

  @Put('destinations/:id/products/:productId')
  upsertDestinationProduct(
    @Param('id') destinationId: string,
    @Param('productId') productId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.catalog.upsertDestinationProduct(
        { actor, request },
        destinationId,
        productId,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Delete('destinations/:id/products/:productId')
  deleteDestinationProduct(
    @Param('id') destinationId: string,
    @Param('productId') productId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.deleteDestinationProduct(
        { actor, request },
        destinationId,
        productId,
        parseExpectedRevision(ifMatch),
      ),
    );
  }

  @Post('media')
  async uploadMedia(
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const file = await request.file();
    if (
      !file ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-media',
        'Catalog upload must contain one supported image.',
      );
    }
    const buffer = await file.toBuffer();
    return this.respond(
      reply,
      this.catalog.uploadMedia(
        { actor, request },
        { buffer, byteLength: buffer.byteLength },
      ),
    );
  }

  @Get('operations/:operationId')
  getOperation(
    @Param('operationId') operationId: string,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.getOperation(actor.siteKey, operationId),
    );
  }

  @Get('operations/by-request/:requestId')
  getOperationByRequestId(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.catalog.getOperationByRequestId(actor.siteKey, requestId),
    );
  }

  private async respond(
    reply: FastifyReply,
    responsePromise: Promise<ProtocolResponse>,
  ) {
    const response = await responsePromise;
    reply.status(response.status);
    if (response.etag) reply.header('etag', response.etag);
    if (response.problem) reply.type('application/problem+json');
    return response.body;
  }
}

function parseDryRun(value: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === undefined || value === 'false') return false;
  throw new CatalogProtocolError(
    HttpStatus.BAD_REQUEST,
    'catalog/invalid-request',
    'dryRun must be true or false.',
  );
}
