import { ApiProperty } from '@nestjs/swagger';
import { GameDifficulty, GameMode } from '../gameplay/types/gameplay.types';

export default class CreateSessionDTO {
  @ApiProperty({
    example: 'Easy',
    name: 'difficulty',
    type: String,
    required: true,
    enum: ['Easy', 'Medium', 'Hard'],
  })
  difficulty: GameDifficulty;

  @ApiProperty({
    example: 'ONE_OPERATOR_ONE_MODULE',
    name: 'gameMode',
    type: String,
    required: true,
    enum: ['ONE_OPERATOR_ONE_MODULE', 'RANDOM_ONE_MODULE_SPLIT'],
    description:
      'Mode de jeu: ONE_OPERATOR_ONE_MODULE (1 opérateur = 1 module complet) ou RANDOM_ONE_MODULE_SPLIT (1 module aléatoire, solutions réparties)',
  })
  gameMode: GameMode;

  @ApiProperty({
    example: '123456',
    name: 'agentId',
    type: String,
    required: true,
  })
  agentId: string;
}
