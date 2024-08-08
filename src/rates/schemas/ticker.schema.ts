import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TickerDocument = HydratedDocument<Ticker>;

@Schema()
export class Ticker {
  @Prop({ required: true })
  date!: number;

  @Prop({ required: true })
  base!: string;

  @Prop({ required: true })
  quote!: string;

  @Prop({ required: true })
  rate!: number;
}

export const TickerSchema = SchemaFactory.createForClass(Ticker);

TickerSchema.index({ date: 1 });
TickerSchema.index({ base: 1 });
TickerSchema.index({ quote: 1 });
TickerSchema.index({ base: 1, quote: 1 });
