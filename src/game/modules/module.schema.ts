import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class ModuleEntity {
  @Prop({ type: String, required: true, unique: true })
  name: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: String, required: true })
  rules: string;

  @Prop({ type: String, required: false })
  imgUrl?: string;

  @Prop({ type: [String], required: true })
  solutions: string[];
}

export const ModuleSchema = SchemaFactory.createForClass(ModuleEntity);
