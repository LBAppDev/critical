import React from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { SystemState } from '../types';

interface SystemMonitorProps {
  state: SystemState;
  className?: string;
}

const SystemMonitor: React.FC<SystemMonitorProps> = ({ state, className }) => {
  // Derive aggregate metrics for visualization
  const avgIntegrity = state.sectors.length > 0
    ? state.sectors.reduce((acc, s) => acc + s.structuralIntegrity, 0) / state.sectors.length
    : 100;

  const avgHazard = state.sectors.length > 0
    ? state.sectors.reduce((acc, s) => acc + s.hazardLevel, 0) / state.sectors.length
    : 0;

  const containmentLevel = Math.max(0, 100 - avgHazard);

  const data = [
    { subject: 'Integrity', A: avgIntegrity, fullMark: 100 },
    { subject: 'Power', A: state.globalPower, fullMark: 100 },
    { subject: 'Containment', A: containmentLevel, fullMark: 100 },
    { subject: 'Network', A: state.globalNetwork, fullMark: 100 },
    { subject: 'Order', A: 100 - state.globalPanic, fullMark: 100 }, // Invert panic so 100 is good
  ];

  // Determine color based on overall health
  const avgHealth = (avgIntegrity + state.globalPower + containmentLevel + (100 - state.globalPanic)) / 4;
  const strokeColor = avgHealth < 40 ? '#ef4444' : avgHealth < 70 ? '#f59e0b' : '#10b981';
  const fillColor = avgHealth < 40 ? '#ef4444' : avgHealth < 70 ? '#f59e0b' : '#10b981';

  return (
    <div className={`relative ${className}`}>
      {/* Background Grid Decoration */}
      <div className="absolute inset-0 border border-white/10 rounded-full animate-[spin_10s_linear_infinite] opacity-20 pointer-events-none" />
      <div className="absolute inset-4 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse] opacity-20 pointer-events-none" />

      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#333" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }} 
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="System Status"
            dataKey="A"
            stroke={strokeColor}
            strokeWidth={2}
            fill={fillColor}
            fillOpacity={0.4}
            isAnimationActive={true}
          />
        </RadarChart>
      </ResponsiveContainer>
      
      {/* Central readout */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <span className={`text-2xl font-bold font-mono ${avgHealth < 30 ? 'text-red-500 animate-pulse' : 'text-white/50'}`}>
          {Math.round(avgHealth)}%
        </span>
      </div>
    </div>
  );
};

export default SystemMonitor;