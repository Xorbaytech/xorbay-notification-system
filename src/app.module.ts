import { Module } from '@nestjs/common';
import { CommunicationModule } from './communication/communication.module';

@Module({
  imports: [CommunicationModule],
})
export class AppModule {}
