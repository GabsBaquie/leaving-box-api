import { Player } from 'src/session/interface/session.interface';

export const createAgentPlayer = (agentId: string): Player => ({
  id: agentId,
  role: 'agent',
  label: 'agent',
});

export const createAnalystePlayer = (
  analysteId: string,
  existingPlayers: Player[],
): Player => {
  const analystesCount = existingPlayers.filter(
    (p) => p.role === 'analyste',
  ).length;
  return {
    id: analysteId,
    role: 'analyste',
    label: `analyste ${analystesCount + 1}`,
  };
};
