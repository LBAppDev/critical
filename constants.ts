import { RoleType, SystemState, Action } from './types';

export const INITIAL_SECTORS = [
  { id: 's1', name: 'Core Reactor', type: 'power', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's2', name: 'Med-Block Alpha', type: 'medical', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's3', name: 'Comms Spire', type: 'network', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's4', name: 'Habitation Ring A', type: 'residential', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's5', name: 'Habitation Ring B', type: 'residential', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's6', name: 'Command Center', type: 'command', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's7', name: 'Industrial Zone', type: 'industrial', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's8', name: 'Transit Hub', type: 'industrial', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
  { id: 's9', name: 'Outer Airlocks', type: 'industrial', structuralIntegrity: 100, hazardLevel: 0, activeEventId: null },
] as const;

export const INITIAL_SYSTEM_STATE: SystemState = {
  globalPanic: 0,
  globalPower: 100,
  globalNetwork: 100,
  sectors: JSON.parse(JSON.stringify(INITIAL_SECTORS)),
};

export const ESSENTIAL_ROLES = [RoleType.COMMANDER, RoleType.ENGINEER, RoleType.BIO_SEC, RoleType.COMMS];
export const SUPPORT_ROLES = [RoleType.SECURITY, RoleType.LOGISTICS];

export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  [RoleType.COMMANDER]: "Strategic oversight. Authority to trigger city-wide lockdowns.",
  [RoleType.ENGINEER]: "Maintains Core Reactor and sector structural integrity.",
  [RoleType.BIO_SEC]: "Manages medical hazards and containment protocols.",
  [RoleType.COMMS]: "Maintains network uplinks and manages public information.",
  [RoleType.SECURITY]: "Suppresses riots in habitation zones. High physical risk.",
  [RoleType.LOGISTICS]: "Emergency supply routing. Boosts efficiency of other roles.",
};

export const ACTIONS: Action[] = [
  // COMMANDER
  { id: 'cmd_lockdown', role: RoleType.COMMANDER, label: 'City Lockdown', description: 'Reduces Panic significantly. High Power cost.', cooldown: 30, targetType: 'GLOBAL', cost: { resource: 'globalPower', amount: 20 } },
  { id: 'cmd_rally', role: RoleType.COMMANDER, label: 'Rally Troops', description: 'Boosts Sector Integrity slightly.', cooldown: 15, targetType: 'GLOBAL' },
  
  // ENGINEER
  { id: 'eng_reinforce', role: RoleType.ENGINEER, label: 'Reinforce Sector', description: 'Repairs Structure in damaged sectors.', cooldown: 10, targetType: 'SECTOR' },
  { id: 'eng_overcharge', role: RoleType.ENGINEER, label: 'Reactor Overcharge', description: 'Restores Global Power. Risks damage.', cooldown: 20, targetType: 'GLOBAL' },

  // BIO_SEC
  { id: 'bio_cleanse', role: RoleType.BIO_SEC, label: 'Decon Sweep', description: 'Reduces Hazard levels in sectors.', cooldown: 12, targetType: 'SECTOR' },
  { id: 'bio_quarantine', role: RoleType.BIO_SEC, label: 'Quarantine', description: 'Stops hazard spread but increases Panic.', cooldown: 18, targetType: 'SECTOR' },

  // COMMS
  { id: 'com_broadcast', role: RoleType.COMMS, label: 'Calm Broadcast', description: 'Reduces Global Panic.', cooldown: 10, targetType: 'GLOBAL' },
  { id: 'com_reboot', role: RoleType.COMMS, label: 'Network Reboot', description: 'Restores Global Network.', cooldown: 25, targetType: 'GLOBAL' },

  // SECURITY
  { id: 'sec_suppress', role: RoleType.SECURITY, label: 'Riot Suppression', description: 'Forcefully lowers panic in a sector.', cooldown: 15, targetType: 'SECTOR' },
  { id: 'sec_checkpoint', role: RoleType.SECURITY, label: 'Secure Checkpoint', description: 'Prevents events from spreading.', cooldown: 20, targetType: 'SECTOR' },

  // LOGISTICS
  { id: 'log_supply', role: RoleType.LOGISTICS, label: 'Supply Drop', description: 'Instantly refreshes cooldowns for others.', cooldown: 45, targetType: 'GLOBAL' },
  { id: 'log_reroute', role: RoleType.LOGISTICS, label: 'Energy Reroute', description: 'Move power to specific sectors.', cooldown: 10, targetType: 'SECTOR' },
];

export const DISASTER_TEMPLATES = [
  { title: "Reactor Leak", desc: "Radiation spike detected.", severity: 'CRITICAL', targetType: 'power' },
  { title: "Riots", desc: "Civil unrest escalation.", severity: 'MEDIUM', targetType: 'residential' },
  { title: "Structure Fire", desc: "Fire containment failing.", severity: 'MEDIUM', targetType: 'industrial' },
  { title: "Bio-Outbreak", desc: "Pathogen detected.", severity: 'CRITICAL', targetType: 'medical' },
  { title: "Signal Jamming", desc: "External interference.", severity: 'LOW', targetType: 'network' },
  { title: "Sabotage", desc: "Command systems compromised.", severity: 'CRITICAL', targetType: 'command' },
];