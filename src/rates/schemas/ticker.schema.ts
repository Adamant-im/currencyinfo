import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TickerDocument = HydratedDocument<Ticker>;

@Schema()
export class Ticker {
  @Prop({ required: true })
  date!: number;

  @Prop({ type: Map, of: Number })
  tickers!: Record<string, number>;
}

export const TickerSchema = SchemaFactory.createForClass(Ticker);
