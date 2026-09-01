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

// Every `/getHistory` filter sorts by `date`, so each index ends with it and the sort
// is index-provided rather than blocking. The leading fields are prefixes of these
// keys, so `{ base: 1 }`, `{ quote: 1 }` and `{ base: 1, quote: 1 }` are not declared
// separately.
//
// - `{ date: 1 }`                    unfiltered history
// - `{ base: 1, date: -1 }`          `coin=ADM/`, and one branch of a bare `coin=ADM`
// - `{ quote: 1, date: -1 }`         `coin=/USD`, and the other branch of `coin=ADM`
// - `{ base: 1, quote: 1, date: -1 }` exact `coin=ADM/USD`
//
// The bare-symbol form is an `$or` over base and quote; giving both branches a
// date-ordered index lets the planner merge them in sorted order instead of sorting
// the whole matching history before the cursor can stop.
TickerSchema.index({ date: 1 });
TickerSchema.index({ base: 1, date: -1 });
TickerSchema.index({ quote: 1, date: -1 });
TickerSchema.index({ base: 1, quote: 1, date: -1 });
