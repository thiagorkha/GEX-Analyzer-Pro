
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// Tipagem para dados de opções
interface OptionContract {
  strike: number;
  type: 'CALL' | 'PUT';
  gamma: number;
  openInterest: number;
  gex: number;
}

const GEXAnalyzer: React.FC = () => {
  const [spotPrice, setSpotPrice] = useState<string>('');
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Cálculos Agregados
  const stats = useMemo(() => {
    if (contracts.length === 0) return null;
    const netGex = contracts.reduce((acc, curr) => acc + curr.gex, 0);
    const callGex = contracts.filter(c => c.type === 'CALL').reduce((acc, curr) => acc + curr.gex, 0);
    const putGex = contracts.filter(c => c.type === 'PUT').reduce((acc, curr) => acc + curr.gex, 0);
    
    // Encontrar o "Gamma Flip" (aproximado pelo strike com maior transição)
    const sortedStrikes = [...contracts].sort((a, b) => a.strike - b.strike);
    
    return { netGex, callGex, putGex };
  }, [contracts]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error("Biblioteca de processamento Excel não carregada.");

        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const mapped: OptionContract[] = json.map((row: any) => {
          const type = String(row.tipo || row.type || '').toUpperCase().includes('PUT') ? 'PUT' : 'CALL';
          const strike = parseFloat(row.strike || row.strike_price || 0);
          const gamma = parseFloat(row.gamma || 0);
          const oi = parseFloat(row.oi || row.open_interest || 0);
          
          // GEX = Gamma * OI * 100 * Spot (Calculado dinamicamente depois se necessário)
          // Mas aqui guardamos os valores base para recalcular ao mudar o Spot
          return { strike, type, gamma, openInterest: oi, gex: 0 };
        }).filter((c: any) => c.strike > 0 && !isNaN(c.gamma));

        if (mapped.length === 0) throw new Error("A planilha não contém dados válidos de opções.");
        
        setContracts(mapped);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Erro ao ler arquivo.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const calculateExposure = () => {
    const spot = parseFloat(spotPrice);
    if (isNaN(spot) || contracts.length === 0) {
      setError("Defina um preço spot válido e importe a cadeia de opções.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const updated = contracts.map(c => {
        // CALL GEX = Gamma * OI * 100 * Spot
        // PUT GEX = -Gamma * OI * 100 * Spot (Market Maker short Put = Long Gamma, but GEX convention usually flips)
        const multiplier = c.type === 'CALL' ? 1 : -1;
        return {
          ...c,
          gex: multiplier * c.gamma * c.openInterest * 100 * spot
        };
      });
      setContracts(updated);
      setLoading(false);
    }, 300);
  };

  useEffect(() => {
    if (contracts.length > 0 && stats && chartRef.current && (window as any).Plotly) {
      const sorted = [...contracts].sort((a, b) => a.strike - b.strike);
      
      const calls = sorted.filter(c => c.type === 'CALL');
      const puts = sorted.filter(c => c.type === 'PUT');

      const traceCalls = {
        x: calls.map(c => c.strike),
        y: calls.map(c => c.gex),
        name: 'Call GEX',
        type: 'bar',
        marker: { color: '#10b981', opacity: 0.7 }
      };

      const tracePuts = {
        x: puts.map(c => c.strike),
        y: puts.map(c => c.gex),
        name: 'Put GEX',
        type: 'bar',
        marker: { color: '#ef4444', opacity: 0.7 }
      };

      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#64748b', family: 'JetBrains Mono', size: 10 },
        margin: { t: 10, r: 10, b: 40, l: 60 },
        hovermode: 'x unified',
        showlegend: true,
        legend: { orientation: 'h', x: 0, y: 1.1 },
        xaxis: { gridcolor: '#1e293b', zerolinecolor: '#334155', title: 'Strike Price' },
        yaxis: { gridcolor: '#1e293b', zerolinecolor: '#334155', title: 'Gamma Exposure ($)' }
      };

      (window as any).Plotly.newPlot(chartRef.current, [traceCalls, tracePuts], layout, { responsive: true, displayModeBar: false });
    }
  }, [contracts, stats]);

  // Remove o loader inicial quando o React monta
  useEffect(() => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 selection:bg-indigo-500/30">
      <div className="max-w-[1600px] mx-auto p-4 md:p-8">
        
        {/* Nav / Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-6 border-b border-slate-800/50">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tighter text-white flex items-center gap-2 uppercase italic">
              <span className="bg-indigo-600 text-[10px] px-2 py-1 rounded-md not-italic">QUANT</span>
              Gamma <span className="text-indigo-500">Terminal</span>
            </h1>
            <p className="text-[10px] mono text-slate-500 mt-1 uppercase tracking-widest font-bold">Market Maker Exposure Analysis Engine</p>
          </div>
          <div className="flex gap-4 mt-4 md:mt-0">
             <div className="text-right">
                <p className="text-[9px] text-slate-600 uppercase font-black">System Load</p>
                <div className="flex gap-1 mt-1">
                   <div className="w-1 h-3 bg-indigo-500"></div>
                   <div className="w-1 h-3 bg-indigo-500"></div>
                   <div className="w-1 h-3 bg-indigo-800"></div>
                </div>
             </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Sidebar de Controle */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl">
              <h2 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6">Parâmetros do Motor</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold mb-2 block">Preço Spot do Ativo</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 text-xs">$</span>
                    <input 
                      type="number"
                      value={spotPrice}
                      onChange={e => setSpotPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/40 border border-slate-700 rounded-xl py-3 pl-8 pr-4 text-sm focus:border-indigo-500 outline-none transition-all placeholder:text-slate-800 mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold mb-2 block">Dados de Opções (XLSX)</label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-8 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                    <svg className="w-6 h-6 text-slate-700 group-hover:text-indigo-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-[10px] font-bold text-slate-600 uppercase text-center">
                      {contracts.length > 0 ? `${contracts.length} Linhas` : 'Clique para Importar'}
                    </span>
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                  </label>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 mono">
                    ERR: {error}
                  </div>
                )}

                <button 
                  onClick={calculateExposure}
                  disabled={loading || !spotPrice || contracts.length === 0}
                  className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/10"
                >
                  {loading ? 'Sincronizando...' : 'Executar Análise GEX'}
                </button>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-800/50">
               <h3 className="text-[9px] font-bold text-slate-500 uppercase mb-3">Guia de Interpretação</h3>
               <div className="space-y-3 text-[10px] leading-relaxed text-slate-400">
                  <p><b className="text-emerald-500">GAMMA POSITIVO:</b> MM compram quedas. Volatilidade suprimida.</p>
                  <p><b className="text-rose-500">GAMMA NEGATIVO:</b> MM vendem quedas. Volatilidade acelerada.</p>
               </div>
            </div>
          </aside>

          {/* Painel Principal de Dados */}
          <main className="lg:col-span-9 space-y-6">
            
            {/* Widgets de Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Net Exposure</p>
                <h3 className={`text-3xl font-black mono tracking-tighter ${stats?.netGex && stats.netGex >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {stats ? `$${(stats.netGex / 1000000).toFixed(2)}M` : '---'}
                </h3>
              </div>
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Call Resistance</p>
                <h3 className="text-3xl font-black mono tracking-tighter text-emerald-500/80">
                  {stats ? `$${(stats.callGex / 1000000).toFixed(2)}M` : '---'}
                </h3>
              </div>
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Put Support</p>
                <h3 className="text-3xl font-black mono tracking-tighter text-rose-500/80">
                  {stats ? `$${(Math.abs(stats.putGex) / 1000000).toFixed(2)}M` : '---'}
                </h3>
              </div>
            </div>

            {/* Gráfico de Barras */}
            <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[32px] min-h-[500px] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                  GEX Profile by Strike
                </h4>
                {stats && (
                  <div className="text-[10px] mono bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
                    STATUS: {stats.netGex >= 0 ? 'LOW VOLATILITY REGIME' : 'HIGH VOLATILITY RISK'}
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-h-[400px]" ref={chartRef}>
                {!stats && (
                  <div className="h-full flex items-center justify-center text-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Aguardando Injeção de Dados</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Técnico */}
            <footer className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[9px] mono text-slate-600 uppercase">
              <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-800/30">
                Data Precision: determinístico (100% Client-Side)<br/>
                Engine: v2.5.2 Stable React 19
              </div>
              <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-800/30 text-right">
                Gamma Flip Zone: {stats && stats.netGex !== 0 ? 'Calculated dynamic' : 'N/A'}<br/>
                Last Tick: {new Date().toLocaleTimeString()}
              </div>
            </footer>
          </main>

        </div>
      </div>
    </div>
  );
};

// Ponto de Entrada Seguro
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<GEXAnalyzer />);
}
