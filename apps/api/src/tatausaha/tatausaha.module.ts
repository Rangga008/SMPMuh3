import { Module } from '@nestjs/common';
import { TatausahaController } from './tatausaha.controller';
import { TatausahaService } from './tatausaha.service';

@Module({
  controllers: [TatausahaController],
  providers: [TatausahaService],
  exports: [TatausahaService],
})
export class TatausahaModule {}
