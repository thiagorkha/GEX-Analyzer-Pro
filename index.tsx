import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Interfaces de Dados
interface OptionData {
  ticker: string;
  tipo: 'CALL' | 'PUT';
  strike: number;
  gamma: number;
  oi: number;
  gex?: number;
}

const GEXAnalyzer: React.FC = () => {
  const [currentPrice, setCurrentPrice] = useState<string>('');
  const [options, setOptions] = useState<OptionData[]>([]);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error("Dependência XLSX não encontrada.");
        
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        const mapped = data.map((row: any) => ({
          ticker: row.ticker || row.symbol || row.ativo || 'ASSET',
          tipo: String(row.tipo || row.type || '').toUpperCase().includes('PUT') ? 'PUT' : 'CALL',
          strike: parseFloat(row.strike || row.strike_price || 0),
          gamma: parseFloat(row.gamma || 0),
          oi: parseFloat(row.oi || row.open_interest || 0),
        })).filter((o: any) => o.strike > 0 && !isNaN(o.gamma));

        if (mapped.length === 0) throw new Error("Planilha inválida ou sem colunas compatíveis.");
        
        setOptions(mapped);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Erro ao processar arquivo.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const calculateGEX = () => {
    const spot = parseFloat(currentPrice);
    if (isNaN(spot) || options.length === 0) {
      setError("Insira um preço spot válido e carregue os dados.");
      return;
    }

    setLoading(true);
    // Simulação de processamento para feedback visual
    setTimeout(() => {
      try {
        const processed = options.map(o => ({
          ...o,
          gex: o.tipo === 'CALL' 
            ? (o.gamma * o.oi * 100 * spot) 
            : (-o.gamma * o.oi * 100 * spot)
        }));
        
        const total = processed.reduce((acc, curr) => acc + (curr.gex || 0), 0);
        setResults({ total, processed });
        setError(null);
      } catch (err) {
        setError("Falha no cálculo matemático.");
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  useEffect(() => {
    if (results && chartRef.current && (window as any).Plotly) {
      const calls = results.processed.filter((o: any) => o.tipo === 'CALL');
      const puts = results.processed.filter((o: any) => o.tipo === 'PUT');
      
      const traces = [
        {
          x: calls.map((o: any) => o.strike),
          y: calls.map((o: any) => o.gex),
          name: 'CALL GEX', type: 'bar', marker: { color: '#10b981' }
        },
        {
          x: puts.map((o: any) => o.strike),
          y: puts.map((o: any) => o.gex),
          name: 'PUT GEX', type: 'bar', marker: { color: '#ef4444' }
        }
      ];

      (window as any).Plotly.newPlot(chartRef.current, traces, {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8', size: 10, family: 'JetBrains Mono' },
        margin: { t: 20, r: 20, b: 40, l: 60 },
        showlegend: true,
        legend: { x: 0, y: 1.2, orientation: 'h' },
        xaxis: { gridcolor: '#1e293b', title: { text: 'STRIKE', font: { size: 9 } } },
        yaxis: { gridcolor: '#1e293b', title: { text: 'EXPOSURE ($)', font: { size: 9 } } }
      }, { responsive: true, displayModeBar: false });
    }
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-10 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded italic">PRO</span>
              <h1 className="text-3xl font-black tracking-tighter uppercase">Gamma <span className="text-indigo-500">Terminal</span></h1>
            </div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em]">Quantitative Market Exposure Engine v2.5</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div className="hidden sm:block">
              <p className="text-[9px] font-bold text-slate-600 uppercase">Status do Sistema</p>
              <p className="text-xs font-mono text-emerald-500 font-bold tracking-tight">ONLINE / SEM LATÊNCIA</p>
            </div>
          </div>
        </header>

        {/* Painel Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar de Entrada */}
          <aside className="lg:col-span-1 space-y-6">
            <div className="glass p-6 rounded-3xl shadow-2xl">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6">Configurações de Fluxo</h3>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-2 block">Preço Spot (Atual)</label>
                  <input 
                    type="number" 
                    value={currentPrice}
                    onChange={e => setCurrentPrice(e.target.value)}
                    placeholder="Ex: 5840.50"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-2 block">Dados de Opções (XLSX/CSV)</label>
                  <label className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-6 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all">
                    <svg className="w-6 h-6 text-slate-700 group-hover:text-indigo-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-400 text-center uppercase">
                      {options.length > 0 ? `${options.length} Strikes Carregados` : 'Clique para Importar'}
                    </span>
                    <input type="file" onChange={handleFile} className="hidden" accept=".xlsx,.xls,.csv" />
                  </label>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-[10px] font-mono text-red-400">
                    ERR: {error}
                  </div>
                )}

                <button 
                  onClick={calculateGEX}
                  disabled={loading || !currentPrice || options.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/10"
                >
                  {loading ? 'Processando...' : 'Calcular Exposição'}
                </button>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-slate-900/30 border border-slate-800/50">
               <p className="text-[8px] text-slate-600 leading-relaxed font-mono">
                 GEX > 0: Market Makers (MM) reduzem volatilidade (compra nos dips).<br/><br/>
                 GEX < 0: MM aceleram volatilidade (venda nos dips).
               </p>
            </div>
          </aside>

          {/* Área de Gráficos e Resultados */}
          <main className="lg:col-span-3 space-y-6">
            {!results ? (
              <div className="glass h-[500px] rounded-[40px] flex flex-col items-center justify-center text-slate-700 border-dashed">
                <div className="w-16 h-16 bg-slate-900/50 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest">Aguardando Execução do Motor</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Widgets Rápidos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass p-6 rounded-3xl border-l-4 border-indigo-500">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Net Gamma Exposure ($)</p>
                    <h2 className={`text-4xl font-black mono tracking-tighter ${results.total >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {results.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </h2>
                  </div>
                  <div className="glass p-6 rounded-3xl">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Regime de Volatilidade</p>
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${results.total >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">
                        {results.total >= 0 ? 'Gamma Positivo' : 'Gamma Negativo'}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Gráfico Principal */}
                <div className="glass p-8 rounded-[40px]">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Distribuição de Gamma por Strike Price</h4>
                  <div ref={chartRef} className="w-full h-[400px]"></div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// Inicialização Robusta
const rootNode = document.getElementById('root');
if (rootNode) {
  createRoot(rootNode).render(<GEXAnalyzer />);
}