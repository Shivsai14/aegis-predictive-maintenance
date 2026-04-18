import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MetricChart = ({ title, data, dataKey, color, unit, fallbackValue, minimal = false }) => {
  // 1. ENSURE DATA IS AN ARRAY
  let chartData = Array.isArray(data) ? data : [];

  // 2. MALENDAU DATA MAPPING
  if (chartData.length === 0) {
    const base = fallbackValue || 0;
    chartData = Array.from({ length: 15 }).map((_, i) => ({
      timestamp: `-${15 - i}s`,
      [dataKey]: base + (Math.random() * (base * 0.05))
    }));
  }

  return (
    <div className={`w-full flex flex-col ${minimal ? 'h-full flex-1' : 'min-h-[120px]'}`}>
      {!minimal && (
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-gray-400 text-[9px] font-bold tracking-widest uppercase">
            {title}
          </h3>
          <span className="text-[8px] text-cyan-500 font-mono bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-500/20">
            LIVE {unit}
          </span>
        </div>
      )}

      <div className="flex-grow w-full relative overflow-hidden group min-h-[40px]">
        <div className="absolute top-0 bottom-0 w-32 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent animate-scan z-10 pointer-events-none mix-blend-screen"></div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.03)"
              vertical={false}
            />
            <XAxis dataKey="timestamp" hide={true} />
            <YAxis
              hide={minimal}
              stroke="rgba(255,255,255,0.1)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8 }}
              width={20}
              orientation="right"
              domain={['dataMin - 5', 'dataMax + 5']}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0a0a0f',
                borderColor: 'rgba(255,255,255,0.1)',
                fontSize: '10px',
                borderRadius: '4px'
              }}
              itemStyle={{ color: color }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={true}
              animationDuration={300}
              fill={`url(#gradient-${dataKey})`}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MetricChart;