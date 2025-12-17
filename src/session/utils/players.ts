import { Player } from 'src/session/interface/session.interface';

export const createAgentPlayer = (agentId: string): Player => ({
  id: agentId,
  role: 'agent',
  label: 'agent',
});

export const createOperatorPlayer = (
  operatorId: string,
  existingPlayers: Player[],
): Player => {
  const operatorsCount = existingPlayers.filter(
    (p) => p.role === 'operator',
  ).length;
  return {
    id: operatorId,
    role: 'operator',
    label: `operator ${operatorsCount + 1}`,
  };
};
