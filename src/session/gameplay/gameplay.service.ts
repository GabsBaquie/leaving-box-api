import { Injectable, Logger } from '@nestjs/common';
import { ModuleEntity } from 'src/game/modules/module.schema';
import { ModuleService } from 'src/game/modules/module.service';
import {
  SolutionsDistribution,
  SolutionsByOperator,
} from 'src/session/utils/solutions-distribution';
import { GameplayConfig } from './types/gameplay.types';
import { getDifficultyConfig } from './config/difficulty.config';
import { createModuleSelectionStrategy } from './strategies/module-selection.strategy';
import { createSolutionDistributionStrategy } from './strategies/solution-distribution.strategy';

export type GameStartResult = {
  moduleManuals: Omit<ModuleEntity, 'solutions'>[];
  solutionsDistribution: SolutionsDistribution[];
  solutionsByOperator: SolutionsByOperator;
};

@Injectable()
export class GameplayService {
  private readonly logger = new Logger(GameplayService.name);

  constructor(private readonly moduleService: ModuleService) {}

  /**
   * Récupère la configuration de difficulté (temps max)
   */
  getMaxTime(difficulty: GameplayConfig['difficulty']): number {
    return getDifficultyConfig(difficulty).maxTime;
  }

  /**
   * Démarre une partie selon la configuration (difficulté + mode de jeu)
   */
  async startGame(
    config: GameplayConfig,
    operatorCount: number,
  ): Promise<GameStartResult> {
    // Récupérer tous les modules disponibles
    const allModules = await this.moduleService.findAll();

    if (allModules.length === 0) {
      throw new Error('Aucun module disponible');
    }

    if (operatorCount === 0) {
      throw new Error('Au moins un opérateur est requis pour démarrer le jeu');
    }

    // Sélectionner les modules selon la stratégie
    const moduleSelectionStrategy = createModuleSelectionStrategy(
      config.gameMode,
    );
    const selectedModules = await moduleSelectionStrategy.selectModules(
      allModules,
      operatorCount,
    );

    if (selectedModules.length === 0) {
      throw new Error('Aucun module sélectionné');
    }

    // Créer les IDs des opérateurs (simulés pour la distribution)
    // En réalité, ces IDs viendront de la session
    const operatorIds = Array.from(
      { length: operatorCount },
      (_, i) => `operator-${i + 1}`,
    );

    // Distribuer les solutions selon la stratégie
    const solutionDistributionStrategy = createSolutionDistributionStrategy(
      config.gameMode,
    );
    const { solutionsDistribution, solutionsByOperator } =
      solutionDistributionStrategy.distribute(selectedModules, operatorIds);

    // Retirer les solutions des modules pour l'affichage public
    const moduleManuals = selectedModules.map((m) => {
      const plain = { ...(m as unknown as Record<string, unknown>) };
      delete plain.solutions;
      return plain as Omit<ModuleEntity, 'solutions'>;
    });

    return {
      moduleManuals,
      solutionsDistribution,
      solutionsByOperator,
    };
  }

  /**
   * Démarre une partie avec les IDs réels des opérateurs
   */
  async startGameWithOperators(
    config: GameplayConfig,
    operatorIds: string[],
  ): Promise<GameStartResult> {
    // Récupérer tous les modules disponibles depuis MongoDB
    this.logger.log('Récupération des modules depuis la base de données...');
    const allModules = await this.moduleService.findAll();

    this.logger.log(
      `Modules récupérés: ${allModules.length} module(s) trouvé(s)`,
    );

    if (allModules.length === 0) {
      this.logger.error('Aucun module disponible dans la base de données');
      throw new Error(
        'Aucun module disponible dans la base de données. Veuillez créer des modules via POST /module ou exécuter le script de seed.',
      );
    }

    // Log des modules récupérés (sans les solutions pour la sécurité)
    this.logger.log(
      `Modules disponibles: ${allModules.map((m) => m.name).join(', ')}`,
    );

    if (operatorIds.length === 0) {
      throw new Error('Au moins un opérateur est requis pour démarrer le jeu');
    }

    // Sélectionner les modules selon la stratégie
    const moduleSelectionStrategy = createModuleSelectionStrategy(
      config.gameMode,
    );
    const selectedModules = await moduleSelectionStrategy.selectModules(
      allModules,
      operatorIds.length,
    );

    if (selectedModules.length === 0) {
      throw new Error('Aucun module sélectionné');
    }

    // Distribuer les solutions selon la stratégie
    const solutionDistributionStrategy = createSolutionDistributionStrategy(
      config.gameMode,
    );
    const { solutionsDistribution, solutionsByOperator } =
      solutionDistributionStrategy.distribute(selectedModules, operatorIds);

    // Retirer les solutions des modules pour l'affichage public
    const moduleManuals = selectedModules.map((m) => {
      const plain = { ...(m as unknown as Record<string, unknown>) };
      delete plain.solutions;
      return plain as Omit<ModuleEntity, 'solutions'>;
    });

    return {
      moduleManuals,
      solutionsDistribution,
      solutionsByOperator,
    };
  }
}
