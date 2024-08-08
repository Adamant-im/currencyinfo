import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimestampDocument = HydratedDocument<Timestamp>;

@Schema()
export class Timestamp {
  @Prop({ required: true })
  date!: number;
}

export const TimestampSchema = SchemaFactory.createForClass(Timestamp);

TimestampSchema.index({ date: 1 }, { unique: true });
