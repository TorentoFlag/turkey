import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  parseExpectedRevision,
  toCatalogProblem,
} from './catalog-protocol.schemas.js';
import type { ProtocolResponse } from './catalog-protocol.service.js';
import { ProtocolActor, ProtocolAuthGuard } from './protocol-auth.guard.js';
import type { AuthenticatedProtocolActor } from './protocol-auth.js';
import { StoreOrdersProtocolService } from './store-orders-protocol.service.js';

@Catch()
class StoreOrdersProtocolExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const problem = toCatalogProblem(exception);
    void reply
      .type('application/problem+json')
      .status(problem.status)
      .send(problem.body);
  }
}

@Controller('admin/integration/store-orders/v1')
@UseGuards(ProtocolAuthGuard)
@UseFilters(StoreOrdersProtocolExceptionFilter)
export class StoreOrdersProtocolController {
  constructor(private readonly storeOrders: StoreOrdersProtocolService) {}

  @Get('orders')
  listOrders() {
    return this.storeOrders.listOrders();
  }

  @Patch('orders/:id/processing')
  updateProcessing(
    @Param('id') orderId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.storeOrders.updateProcessing(
        { actor, request },
        orderId,
        parseExpectedRevision(ifMatch),
        body,
      ),
    );
  }

  @Post('orders/:id/refunds')
  requestFullRefund(
    @Param('id') orderId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @ProtocolActor() actor: AuthenticatedProtocolActor,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    return this.respond(
      reply,
      this.storeOrders.requestFullRefund(
        { actor, request },
        orderId,
        parseExpectedRevision(ifMatch),
        body,
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
      this.storeOrders.getOperation(actor.siteKey, operationId),
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
      this.storeOrders.getOperationByRequestId(actor.siteKey, requestId),
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
