import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TickerDocument = HydratedDocument<Ticker>;

/**
 * Mongoose schema representing a single historical rate point for a currency pair.
 */
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
// Compound index serving the pair-filtered history query: the `base`/`quote`
// match and the `date` sort are both covered, so no blocking in-memory sort is
// needed. `{ base: 1, quote: 1 }` is a prefix of this index, so it is not
// declared separately.
TickerSchema.index({ base: 1, quote: 1, date: -1 });
