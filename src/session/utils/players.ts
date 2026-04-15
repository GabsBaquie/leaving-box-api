import { Player } from 'src/session/interface/session.interface';
import { PLAYER_ROLES } from '../config/session.config';

export const createAgentPlayer = (agentId: string): Player => ({
  id: agentId,
  role: PLAYER_ROLES.AGENT,
  label: PLAYER_ROLES.AGENT,
});

export const createAnalystePlayer = (
  analysteId: string,
  existingPlayers: Player[],
): Player => {
  const analystesCount = existingPlayers.filter(
    (p) => p.role === PLAYER_ROLES.ANALYSTE,
  ).length;
  return {
    id: analysteId,
    role: PLAYER_ROLES.ANALYSTE,
    label: `${PLAYER_ROLES.ANALYSTE} ${analystesCount + 1}`,
  };
};
