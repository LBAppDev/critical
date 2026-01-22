import React from 'react';
import { SectorState, SystemState } from '../types';
import { Zap, Activity, Wifi, Shield, Box, AlertTriangle, Lock } from 'lucide-react';

interface CityMapProps {
  system: SystemState;
  onSectorClick?: (sectorId: string) => void;
  selectedSectorId?: string | null;
}

const SectorIcon = ({ type }: { type: string }) => {
  switch(type) {
    case 'power': return <Zap className="w-5 h-5" />;
    case 'medical': return <Activity className="w-5 h-5" />;
    case 'network': return <Wifi className="w-5 h-5" />;
    case 'command': return <Shield className="w-5 h-5" />;
    case 'industrial': return <Box className="w-5 h-5" />;
    default: return <Lock className="w-5 h-5" />;
  }
};

const CityMap: React.FC<CityMapProps> = ({ system, onSectorClick, selectedSectorId }) => {
  return (
    <div className="w-full h-full p-4 flex flex-col items-center justify-center bg-gray-900/50 rounded-xl border border-white/10 relative overflow-hidden">
      {/* Decorative Grid Lines */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
         {[...Array(9)].map((_, i) => (
             <div key={i} className="border border-cyan-500/30"></div>
         ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-md aspect-square relative z-10">
        {system.sectors.map((sector) => {
          const isCritical = sector.structuralIntegrity < 30 || sector.hazardLevel > 70;
          const isSelected = selectedSectorId === sector.id;
          
          return (
            <button
              key={sector.id}
              onClick={() => onSectorClick && onSectorClick(sector.id)}
              className={`
                relative flex flex-col items-center justify-center p-2 rounded border transition-all duration-300
                ${isSelected ? 'ring-2 ring-white scale-105 z-20 bg-gray-800' : 'hover:bg-white/5'}
                ${isCritical ? 'border-red-500 bg-red-900/20 animate-pulse-error' : 'border-cyan-900/50 bg-black/40'}
              `}
            >
              {/* Sector Integrity Bar (Vertical left) */}
              <div className="absolute left-1 top-2 bottom-2 w-1 bg-gray-700 rounded-full overflow-hidden">
                 <div 
                   className={`absolute bottom-0 w-full transition-all duration-500 ${sector.structuralIntegrity < 40 ? 'bg-red-500' : 'bg-cyan-500'}`}
                   style={{ height: `${sector.structuralIntegrity}%` }}
                 />
              </div>

              {/* Icon & Type */}
              <div className={`mb-1 ${isCritical ? 'text-red-400' : 'text-cyan-400'}`}>
                <SectorIcon type={sector.type} />
              </div>
              <span className="text-[10px] font-mono text-center text-gray-400 leading-tight">
                {sector.name}
              </span>

              {/* Hazard Warning Overlay */}
              {sector.hazardLevel > 0 && (
                  <div className="absolute top-1 right-1 flex items-center text-[10px] text-yellow-500 font-bold animate-pulse">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />
                      {Math.round(sector.hazardLevel)}%
                  </div>
              )}

              {/* Active Event Indicator */}
              {sector.activeEventId && (
                  <div className="absolute inset-0 border-2 border-red-500/50 rounded animate-ping opacity-20 pointer-events-none"></div>
              )}
            </button>
          );
        })}
      </div>
      
      <div className="mt-4 flex gap-4 text-xs font-mono text-gray-500">
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-cyan-500"></div> INTEGRITY</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500"></div> HAZARD</div>
      </div>
    </div>
  );
};

export default CityMap;
