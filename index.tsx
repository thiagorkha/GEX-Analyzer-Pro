import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

interface OptionData {
  ticker: string;
  tipo: 'CALL' | 'PUT';
  strike: number;
  gamma: number;
  oi: number;
  gex?: number;
}

interface AnalysisResults {
  totalGex: number;
  regime: string;
  pinRisk: 'Baixo' | 'Médio' | 'Alto';
  gammaWalls: { strike: number; strength: number; type: 'Resistance' | 'Support' }[];
  marketContext: string;
  signals: { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reason: string; confidence: number }[];
}

const GEXAnalyzer: React.FC = () => {
  const [currentPrice, setCurrentPrice] = useState<number | string>('');
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + (5 - d.getDay() + 7) % 7 || 7);
    return d.toISOString().split('T')[0];
  });
  const [options, setOptions] = useState<OptionData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const chartRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = (window as any).XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = (window as any).XLSX.utils.sheet_to_json(ws);
        
        const mappedData = data.map((row: any) => ({
          ticker: row.ticker || row.symbol || row.ativo || 'ASSET',
          tipo: String(row.tipo || row.type || '').toUpperCase().includes('CALL') ? 'CALL' : 'PUT',
          strike: parseFloat(row.strike || row.strike_price || 0),
          gamma: parseFloat(row.gamma || row.gamma_value || 0),
          oi: parseFloat(row.oi || row.open_interest || 0),
        })).filter((o: any) => o.strike > 0 && o.oi > 0);

        if (mappedData.length === 0) throw new Error("Formato de planilha inválido ou sem dados.");
        
        setOptions(mappedData);
        setError(null);
      } catch (err: any) {
        setError("Erro ao ler arquivo: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const performQuantAnalysis = (processedOptions: OptionData[], spot: number): AnalysisResults => {
    const totalGex = processedOptions.reduce((acc, curr) => acc + (curr.gex || 0), 0);
    const regime = totalGex > 0 ? 'Bullish (Estabilidade)' : 'Bearish (Volatilidade)';

    const sortedByAbsGex = [...processedOptions].sort((a, b) => Math.abs(b.gex || 0) - Math.abs(a.gex || 0));
    const topStrikes = sortedByAbsGex.slice(0, 5);
    const maxAbsGex = Math.abs(topStrikes[0]?.gex || 1);

    const gammaWalls = topStrikes.map(o => ({
      strike: o.strike,
      strength: Math.min(100, Math.round((Math.abs(o.gex || 0) / maxAbsGex) * 100)),
      type: o.strike > spot ? 'Resistance' : 'Support' as 'Resistance' | 'Support'
    }));

    const optionsNearSpot = processedOptions.filter(o => Math.abs(o.strike - spot) / spot < 0.02);
    const maxOI = Math.max(...processedOptions.map(o => o.oi), 1);
    const nearSpotMaxOI = Math.max(...optionsNearSpot.map(o => o.oi), 0);
    
    let pinRisk: 'Baixo' | 'Médio' | 'Alto' = 'Baixo';
    if (nearSpotMaxOI > maxOI * 0.7) pinRisk = 'Alto';
    else if (nearSpotMaxOI > maxOI * 0.3) pinRisk = 'Médio';

    const signals: AnalysisResults['signals'] = [];
    if (totalGex > 0) {
      signals.push({
        direction: 'LONG',
        reason: 'Ambiente de Gamma Positivo favorece compressão de volatilidade e suporte.',
        confidence: 0.75
      });
    } else {
      signals.push({
        direction: 'SHORT',
        reason: 'Gamma Negativo indica aceleração de movimentos direcionais (Short Squeeze/Flash Crash).',
        confidence: 0.8
      });
    }

    const nearestWall = gammaWalls[0];
    if (nearestWall && Math.abs(nearestWall.strike - spot) / spot < 0.01) {
      signals.push({
        direction: 'NEUTRAL',
        reason: `Preço em zona de colisão com Wall de ${nearestWall.type} em $${nearestWall.strike}.`,
        confidence: 0.9
      });
    }

    return {
      totalGex,
      regime,
      pinRisk,
      gammaWalls,
      marketContext: `Análise de ${processedOptions.length} strikes concluída. GEX líquido: ${totalGex.toLocaleString()}.`,
      signals
    };
  };

  const runAnalysis = () => {
    if (!currentPrice || options.length === 0) {
      setError("Preencha o preço spot e carregue a planilha de opções.");
      return;
    }

    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const spot = parseFloat(currentPrice.toString());
        const processedOptions = options.map(o => ({
          ...o,
          gex: o.tipo === 'CALL' ? (o.gamma * o.oi * 100 * spot) : (-o.gamma * o.oi * 100 * spot)
        }));

        setResults(performQuantAnalysis(processedOptions, spot));
        setOptions(processedOptions);
        setError(null);
      } catch (err: any) {
        setError("Erro no cálculo: " + err.message);
      } finally {
        setIsAnalyzing(false);
      }
    }, 500);
  };

  useEffect(() => {
    if (results && chartRef.current && (window as any).Plotly) {
      const calls = options.filter(o => o.tipo === 'CALL');
      const puts = options.filter(o => o.tipo === 'PUT');

      const trace1 = {
        x: calls.map(o => o.strike),
        y: calls.map(o => o.gex),
        name: 'Call GEX',
        type: 'bar',
        marker: { color: '#10b981' }
      };

      const trace2 = {
        x: puts.map(o => o.strike),
        y: puts.map(o => o.gex),
        name: 'Put GEX',
        type: 'bar',
        marker: { color: '#ef4444' }
      };

      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' }, title: 'Strike Price' },
        yaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' }, title: 'Gamma Exposure' },
        legend: { font: { color: '#f8fafc' } },
        margin: { t: 20, b: 40, l: 60, r: 20 },
        height: 350
      };

      (window as any).Plotly.newPlot(chartRef.current, [trace1, trace2], layout, { responsive: true, displayModeBar: false });
    }
  }, [results]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">GEX ANALYZER <span className="text-indigo-500">PRO</span></h1>
              <p className="text-[10px] mono text-slate-500 uppercase tracking-widest">Client-Side Quant Terminal</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-4">
             <span className="text-xs text-slate-500 mono bg-slate-900 px-3 py-1 rounded-full border border-slate-800">SYSTEM: ONLINE</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6">
          <div className="glass-card rounded-2xl p-6 space-y-5 border-indigo-500/20">
            <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              Input de Dados
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Preço Atual Spot</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <input 
                    type="number" 
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-8 pr-4 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Data Vencimento</label>
                <input 
                  type="date" 
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm"
                />
              </div>

              <div className="pt-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Importar Opções</label>
                <div 
                  className="border border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-indigo-500/50 hover:bg-slate-900/50 transition-all cursor-pointer relative"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input type="file" id="file-upload" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                  <p className="text-xs font-medium text-slate-400">{options.length > 0 ? `${options.length} strikes carregados` : "Clique para carregar Excel"}</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-[10px] flex items-center gap-2">
                  <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  {error}
                </div>
              )}

              <button 
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] text-sm flex items-center justify-center gap-2"
              >
                {isAnalyzing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "EXECUTAR ANALISE QUANT"}
              </button>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-8 space-y-6">
          {!results ? (
            <div className="h-[500px] glass-card rounded-2xl flex flex-col items-center justify-center text-center p-12 border-slate-800">
               <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800 mb-6 text-slate-700">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Terminal em Espera</h3>
              <p className="text-slate-500 text-sm max-w-xs">Aguardando dados de mercado para iniciar motor de processamento local.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-indigo-500">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Net Exposure (GEX)</p>
                  <p className={`text-xl font-bold mono ${results.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {results.totalGex.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-amber-500">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Regime de Mercado</p>
                  <p className="text-sm font-bold text-amber-400">{results.regime}</p>
                </div>
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-purple-500">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Pinning Risk</p>
                  <p className="text-xl font-bold text-purple-400">{results.pinRisk}</p>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                   <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                   Distribuição Gamma por Strike
                </h3>
                <div ref={chartRef} className="w-full"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-sm font-bold mb-4 text-slate-400">Gamma Walls (Liquidez)</h3>
                  <div className="space-y-3">
                    {results.gammaWalls.map((wall, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">{wall.type}</p>
                          <p className="text-md font-bold mono">${wall.strike.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Power</p>
                          <div className="w-16 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${wall.type === 'Resistance' ? 'bg-indigo-500' : 'bg-emerald-500'}`} style={{ width: `${wall.strength}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-sm font-bold mb-4 text-slate-400">Sinais Quantitativos</h3>
                  <div className="space-y-4">
                    {results.signals.map((signal, i) => (
                      <div key={i} className="pb-3 border-b border-slate-800 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${signal.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : signal.direction === 'SHORT' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-500/20 text-slate-400'}`}>{signal.direction}</span>
                          <span className="text-[9px] font-bold text-slate-600">CONFIDENCE: {Math.round(signal.confidence * 100)}%</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">{signal.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center">
         <p className="text-[10px] mono text-slate-600 uppercase tracking-widest">© 2024 GEX ANALYZER PRO 2.0 | NO-SERVER ARCHITECTURE</p>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<GEXAnalyzer />);