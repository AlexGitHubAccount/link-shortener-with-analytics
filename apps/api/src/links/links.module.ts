import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

@Module({
  controllers: [LinksController],
  providers: [LinksService],
  exports: [LinksService], // redirect module needs it to resolve shortCode -> originalUrl
})
export class LinksModule {}
