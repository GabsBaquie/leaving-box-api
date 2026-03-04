import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleEntity } from './module.schema';
import { Model } from 'mongoose';
import { CreateModuleDto } from './dto/createModule.ressource';

@Injectable()
export class ModuleService {
  private readonly logger = new Logger(ModuleService.name);

  constructor(
    @InjectModel(ModuleEntity.name)
    private readonly ModuleModel: Model<ModuleEntity>,
  ) {}

  async createModule(createdModuleDto: CreateModuleDto): Promise<ModuleEntity> {
    const createdModule = new this.ModuleModel(createdModuleDto);
    return createdModule.save();
  }

  async findAll(): Promise<ModuleEntity[]> {
    try {
      const modules = await this.ModuleModel.find().exec();
      this.logger.log(`Récupération de ${modules.length} module(s) depuis MongoDB`);
      return modules;
    } catch (error) {
      this.logger.error('Erreur lors de la récupération des modules:', error);
      throw new Error(
        `Impossible de récupérer les modules depuis la base de données: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      );
    }
  }

  findOne(id: string): Promise<ModuleEntity | null> {
    return this.ModuleModel.findById(id).exec();
  }

  findSome(quantity: number): Promise<ModuleEntity[]> {
    return this.ModuleModel.aggregate().sample(quantity).exec();
  }

  update(id: string, module: ModuleEntity): Promise<ModuleEntity | null> {
    return this.ModuleModel.findByIdAndUpdate(id, module, { new: true }).exec();
  }

  delete(id: string): Promise<ModuleEntity | null> {
    return this.ModuleModel.findByIdAndDelete(id).exec();
  }
}
