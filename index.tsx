import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Tipagens e Interfaces ---
interface OptionContract {
  strike: number;
  type: 'CALL' | 'PUT';
  gamma: number;
  oi: number;
  gex: number;
}

interface QuantMetrics {
  netGex: number;
  callWall: number;
  putWall: number;
  gammaFlip: number;
  gammaPin: number;
  regime: 'POSITIVE' | 'NEGATIVE';
  spotToFlipDist: number;
}

// --- Componente de Alerta de Estratégia ---
const StrategySignal: React.FC<{ metrics: QuantMetrics; spot: number }> = ({ metrics, spot }) => {
  const isPositive = metrics.regime === 'POSITIVE';
  
  const getStrategy = () => {
    if (isPositive) {
      if (spot >= metrics.callWall * 0.98) return {
        title: "Dampening Effect / Mean Reversion",
        desc: "O preço está próximo à Call Wall em regime de Gamma Positivo. Market Makers vendem ralis. Expectativa de compressão de volatilidade.",
        action: "Venda de Volatilidade / Iron Condors / Realização de Lucros em Longs."
      };
      return {
        title: "Stable / Low Volatility",
        desc: "Mercado em zona de conforto dos Market Makers. Movimentos suaves e previsíveis.",
        action: "Carry Trades / Venda de Put distantes / Long Equity."
      };
    } else {
      if (spot <= metrics.putWall * 1.02) return {
        title: "Volatility Acceleration Risk",
        desc: "Abaixo da Put Wall em regime negativo. Market Makers precisam vender conforme cai. Risco de 'Liquidation Cascade'.",
        action: "Hedge com Puts Curtas / Long VIX / Redução de Exposição Direcional."
      };
      return {
        title: "High Momentum / Trend Following",
        desc: "Abaixo do Flip point, a volatilidade é expandida. Movimentos direcionais tendem a se auto-alimentar.",
        action: "Long Gamma / Straddles / Estratégias de Breakout."
      };
    }
  };

  const strat = getStrategy();

  return (
    <div className={`p-6 rounded-3xl border ${isPositive ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full animate-pulse ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <h3 className="text-sm font-black uppercase tracking-widest text-white">{strat.title}</h3>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-4">{strat.desc}</p>
      <div className="bg-black/40 p-4 rounded-xl border border-white/5">
        <p className="text-[10px] uppercase font-bold text-indigo-400 mb-1">Recomendação Quantitativa:</p>
        <p className="text-sm font-bold text-slate-200">{strat.action}</p>
      </div>
    </div>
  );
};

// --- Aplicação Principal ---
const GammaTerminal: React.FC = () => {
  const [spotInput, setSpotInput] = useState<string>('');
  const [data, setData] = useState<OptionContract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // --- Motor de Cálculo ---
  const metrics = useMemo((): QuantMetrics | null => {
    if (data.length === 0 || !spotInput) return null;
    const spot = parseFloat(spotInput);
    if (isNaN(spot)) return null;

    // 1. Calcular GEX por strike
    const processed = data.map(d => {
      const mult = d.type === 'CALL' ? 1 : -1;
      return { ...d, gex: mult * d.gamma * d.oi * 100 * spot };
    });

    const netGex = processed.reduce((acc, curr) => acc + curr.gex, 0);
    
    // 2. Localizar Walls
    const callWallContract = [...processed].filter(d => d.type === 'CALL').sort((a, b) => b.gex - a.gex)[0];
    const putWallContract = [...processed].filter(d => d.type === 'PUT').sort((a, b) => a.gex - b.gex)[0];
    
    // 3. Localizar Pin (Maior OI Total)
    const strikesMap = new Map<number, number>();
    data.forEach(d => strikesMap.set(d.strike, (strikesMap.get(d.strike) || 0) + d.oi));
    const gammaPin = [...strikesMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

    // 4. Estimar Gamma Flip (Aproximação por mudança de sinal no agregado por strike)
    const sortedStrikes = [...new Set(processed.map(d => d.strike))].sort((a, b) => a - b);
    let gammaFlip = sortedStrikes[0];
    for (let s of sortedStrikes) {
      const strikeGex = processed.filter(d => d.strike === s).reduce((acc, c) => acc + c.gex, 0);
      if (strikeGex > 0) {
        gammaFlip = s;
        break;
      }
    }

    return {
      netGex,
      callWall: callWallContract?.strike || 0,
      putWall: putWallContract?.strike || 0,
      gammaFlip,
      gammaPin,
      regime: netGex >= 0 ? 'POSITIVE' : 'NEGATIVE',
      spotToFlipDist: ((spot / gammaFlip) - 1) * 100
    };
  }, [data, spotInput]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = (window as any).XLSX;
        const workbook = XLSX.read(evt.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);

        const mapped = json.map((row: any) => ({
          strike: parseFloat(row.strike || row.Strike || 0),
          type: String(row.type || row.tipo || row.PC || '').toUpperCase().includes('PUT') ? 'PUT' : 'CALL',
          gamma: parseFloat(row.gamma || row.Gamma || 0),
          oi: parseFloat(row.oi || row.OI || row.open_interest || 0),
          gex: 0
        })).filter((c: any) => c.strike > 0 && !isNaN(c.gamma));

        if (mapped.length === 0) throw new Error("Planilha sem dados compatíveis.");
        setData(mapped);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  useEffect(() => {
    if (metrics && chartRef.current && (window as any).Plotly) {
      const spot = parseFloat(spotInput);
      const strikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
      
      const strikeData = strikes.map(s => {
        const contracts = data.filter(d => d.strike === s);
        const gex = contracts.reduce((acc, curr) => {
          const mult = curr.type === 'CALL' ? 1 : -1;
          return acc + (mult * curr.gamma * curr.oi * 100 * spot);
        }, 0);
        return { s, gex };
      });

      const trace = {
        x: strikeData.map(d => d.s),
        y: strikeData.map(d => d.gex),
        type: 'bar',
        name: 'Net GEX',
        marker: {
          color: strikeData.map(d => d.gex >= 0 ? '#10b981' : '#ef4444'),
          opacity: 0.8
        }
      };

      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8', family: 'JetBrains Mono', size: 10 },
        margin: { t: 20, r: 20, b: 40, l: 80 },
        xaxis: { 
            gridcolor: '#1e293b', 
            title: 'STRIKE PRICE',
            shapes: [{
                type: 'line', x0: spot, x1: spot, y0: 0, y1: 1, yref: 'paper',
                line: { color: '#6366f1', width: 2, dash: 'dot' }
            }]
        },
        yaxis: { gridcolor: '#1e293b', title: 'EXPOSURE ($)' }
      };

      (window as any).Plotly.newPlot(chartRef.current, [trace], layout, { responsive: true, displayModeBar: false });
    }
  }, [metrics, data, spotInput]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-4 md:p-8 font-sans">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-800 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-white italic">G</div>
              <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">Gamma <span className="text-indigo-500">Terminal</span></h1>
              <span className="bg-slate-800 text-[10px] px-2 py-1 rounded text-slate-400 font-bold tracking-tighter uppercase">Professional v2.5</span>
            </div>
            <p className="text-[10px] mono text-slate-500 tracking-[0.4em] uppercase font-bold">Real-Time Market Maker Exposure & Strategy Engine</p>
          </div>

          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-600 uppercase mb-1">Engine Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
                <p className="text-xs font-black text-emerald-500 uppercase tracking-tighter">Connected / Optimal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-6">Input Terminal</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Asset Spot Price</label>
                  <input 
                    type="number" 
                    value={spotInput}
                    onChange={e => setSpotInput(e.target.value)}
                    placeholder="Enter Spot (e.g. 5820.50)"
                    className="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Options Chain (Excel)</label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-8 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                    <svg className="w-6 h-6 text-slate-600 group-hover:text-indigo-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">{data.length > 0 ? `${data.length} Contracts Loaded` : 'Drop Chain File'}</span>
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                  </label>
                </div>

                {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] text-rose-400 mono">ERROR: {error}</div>}
              </div>
            </div>

            {metrics && spotInput && (
              <StrategySignal metrics={metrics} spot={parseFloat(spotInput)} />
            )}
          </aside>

          {/* Main Dashboard */}
          <main className="lg:col-span-9 space-y-6">
            
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Net GEX Exposure', val: metrics ? `$${(metrics.netGex / 1000000).toFixed(2)}M` : '---', color: metrics?.regime === 'POSITIVE' ? 'text-emerald-400' : 'text-rose-500' },
                { label: 'Gamma Flip Zone', val: metrics?.gammaFlip || '---', color: 'text-indigo-400' },
                { label: 'Call Wall (Ceiling)', val: metrics?.callWall || '---', color: 'text-emerald-500' },
                { label: 'Put Wall (Floor)', val: metrics?.putWall || '---', color: 'text-rose-500' }
              ].map((s, i) => (
                <div key={i} className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-600 uppercase mb-1 tracking-tighter">{s.label}</p>
                  <p className={`text-xl font-black mono ${s.color}`}>{s.val}</p>
                </div>
              ))}
            </div>

            {/* Main Visual */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-[40px] p-8 min-h-[500px] flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                   <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">GEX Profile Analysis</h3>
                   {metrics && (
                     <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Regime:</span>
                        <span className={`text-[10px] font-black uppercase ${metrics.regime === 'POSITIVE' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {metrics.regime} GAMMA
                        </span>
                     </div>
                   )}
                </div>
                <div className="text-[9px] mono text-slate-600">UNIT: USD EXPOSURE PER STRIKE</div>
              </div>

              <div className="flex-1" ref={chartRef}>
                {!metrics && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-4">
                    <div className="w-12 h-12 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Quant Injection</p>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Data Table */}
            {data.length > 0 && spotInput && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Active Contracts Data</h4>
                  <p className="text-[9px] mono text-slate-600 tracking-tighter">Total Contracts: {data.length}</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-[10px] mono border-collapse">
                    <thead className="sticky top-0 bg-slate-900 z-10">
                      <tr className="text-slate-500 border-b border-slate-800">
                        <th className="p-4 uppercase">Strike</th>
                        <th className="p-4 uppercase">Type</th>
                        <th className="p-4 uppercase">Gamma</th>
                        <th className="p-4 uppercase">OI</th>
                        <th className="p-4 uppercase text-right">GEX Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {[...data].sort((a,b) => a.strike - b.strike).map((d, i) => {
                        const spot = parseFloat(spotInput);
                        const gex = (d.type === 'CALL' ? 1 : -1) * d.gamma * d.oi * 100 * spot;
                        return (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 font-bold text-slate-200">{d.strike.toFixed(2)}</td>
                            <td className={`p-4 font-black ${d.type === 'CALL' ? 'text-emerald-500' : 'text-rose-500'}`}>{d.type}</td>
                            <td className="p-4">{d.gamma.toFixed(6)}</td>
                            <td className="p-4">{d.oi.toLocaleString()}</td>
                            <td className={`p-4 text-right font-bold ${gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ${(gex / 1000).toFixed(1)}k
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// Renderização
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<GammaTerminal />);
}
