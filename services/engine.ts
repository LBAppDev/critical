import { SystemState, GameEvent, Action, RoleType, SectorState } from '../types';
import { DISASTER_TEMPLATES } from '../constants';

export const calculateSystemDecay = (current: SystemState): SystemState => {
  const next = JSON.parse(JSON.stringify(current)) as SystemState;
  
  // Global Decay
  next.globalPower = Math.max(0, next.globalPower - 0.05);
  next.globalPanic = Math.min(100, next.globalPanic + 0.1);

  // Sector Decay based on damage
  next.sectors.forEach(sector => {
    if (sector.structuralIntegrity < 50) {
        // Damaged sectors drain power faster
        next.globalPower = Math.max(0, next.globalPower - 0.02);
    }
    if (sector.hazardLevel > 0) {
        // Hazards damage structure over time
        sector.structuralIntegrity = Math.max(0, sector.structuralIntegrity - 0.1);
        // And cause panic
        next.globalPanic = Math.min(100, next.globalPanic + 0.05);
    }
  });

  return next;
};

export const generateEvent = (round: number, sectors: SectorState[]): GameEvent | null => {
  const threshold = 0.05 + (round * 0.02);
  
  if (Math.random() < threshold) {
    const template = DISASTER_TEMPLATES[Math.floor(Math.random() * DISASTER_TEMPLATES.length)];
    
    // Find matching target sector type
    const matchingSectors = sectors.filter(s => s.type === template.targetType || template.targetType === 'all');
    const target = matchingSectors.length > 0 
        ? matchingSectors[Math.floor(Math.random() * matchingSectors.length)] 
        : sectors[Math.floor(Math.random() * sectors.length)];

    return {
      id: Math.random().toString(36).substr(2, 9),
      title: template.title,
      description: template.desc,
      severity: template.severity as any,
      targetSectorId: target.id,
      timestamp: Date.now()
    };
  }
  return null;
};

export const applyEventImpact = (state: SystemState, event: GameEvent): SystemState => {
  const newState = JSON.parse(JSON.stringify(state)) as SystemState;
  const sector = newState.sectors.find(s => s.id === event.targetSectorId);
  
  if (sector) {
      sector.activeEventId = event.id;
      if (event.severity === 'CRITICAL') {
          sector.structuralIntegrity -= 20;
          sector.hazardLevel += 30;
      } else {
          sector.structuralIntegrity -= 10;
          sector.hazardLevel += 15;
      }
      
      // Events always raise global panic slightly
      newState.globalPanic += 5;
  }
  
  return newState;
};

export const applyAction = (state: SystemState, action: Action, targetSectorId?: string): SystemState => {
  const newState = JSON.parse(JSON.stringify(state)) as SystemState;
  
  // Pay Global Costs
  if (action.cost) {
      if (action.cost.resource === 'globalPower') newState.globalPower -= action.cost.amount;
  }

  // Apply Effects
  if (action.targetType === 'GLOBAL') {
      if (action.id === 'cmd_lockdown') newState.globalPanic -= 25;
      if (action.id === 'cmd_rally') newState.sectors.forEach(s => s.structuralIntegrity = Math.min(100, s.structuralIntegrity + 5));
      if (action.id === 'eng_overcharge') newState.globalPower += 25;
      if (action.id === 'com_broadcast') newState.globalPanic -= 10;
      if (action.id === 'com_reboot') newState.globalNetwork = 100;
      if (action.id === 'log_supply') {
          // Logic handled in UI (cooldown reset), simulation effect minimal
          newState.globalPower += 5; 
      }
  } else if (action.targetType === 'SECTOR' && targetSectorId) {
      const sector = newState.sectors.find(s => s.id === targetSectorId);
      if (sector) {
          if (action.id === 'eng_reinforce') sector.structuralIntegrity = Math.min(100, sector.structuralIntegrity + 25);
          if (action.id === 'bio_cleanse') sector.hazardLevel = Math.max(0, sector.hazardLevel - 40);
          if (action.id === 'bio_quarantine') {
              sector.hazardLevel = Math.max(0, sector.hazardLevel - 10);
              newState.globalPanic += 5; // Quarantine scares people
          }
          if (action.id === 'sec_suppress') newState.globalPanic -= 5; // Local suppression helps global panic slightly
          if (action.id === 'log_reroute') {
              sector.structuralIntegrity += 5;
              sector.hazardLevel = Math.max(0, sector.hazardLevel - 5);
          }
      }
  }

  // Clamp values
  newState.globalPanic = Math.max(0, Math.min(100, newState.globalPanic));
  newState.globalPower = Math.max(0, Math.min(100, newState.globalPower));
  
  return newState;
};

export const checkGameOver = (state: SystemState): { isOver: boolean; reason?: string; isVictory: boolean } => {
  const destroyedSectors = state.sectors.filter(s => s.structuralIntegrity <= 0).length;
  
  if (destroyedSectors >= 3) return { isOver: true, reason: "MULTIPLE SECTOR COLLAPSE", isVictory: false };
  if (state.globalPower <= 0) return { isOver: true, reason: "TOTAL BLACKOUT", isVictory: false };
  if (state.globalPanic >= 100) return { isOver: true, reason: "COLONY RIOTS - COMMAND LOST", isVictory: false };
  
  return { isOver: false, isVictory: false };
};
