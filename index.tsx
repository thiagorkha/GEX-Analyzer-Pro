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
        const XLSX = (window as any).XLSX;
        if (!XLSX) throw new Error("Biblioteca de Excel não encontrada.");

        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const mappedData = data.map((row: any) => ({
          ticker: row.ticker || row.symbol || row.ativo || 'ASSET',
          tipo: String(row.tipo || row.type || '').toUpperCase().includes('CALL') ? 'CALL' : 'PUT',
          strike: parseFloat(row.strike || row.strike_price || 0),
          gamma: parseFloat(row.gamma || row.gamma_value || 0),
          oi: parseFloat(row.oi || row.open_interest || 0),
        })).filter((o: any) => o.strike > 0 && o.oi > 0);

        if (mappedData.length === 0) throw new Error("Planilha sem dados compatíveis.");
        
        setOptions(mappedData);
        setError(null);
      } catch (err: any) {
        setError("Erro na planilha: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const runAnalysis = () => {
    if (!currentPrice || options.length === 0) {
      setError("Informe o preço spot e carregue os dados das opções.");
      return;
    }

    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const spot = parseFloat(currentPrice.toString());
        const processed = options.map(o => ({
          ...o,
          gex: o.tipo === 'CALL' ? (o.gamma * o.oi * 100 * spot) : (-o.gamma * o.oi * 100 * spot)
        }));

        const totalGex = processed.reduce((acc, curr) => acc + (curr.gex || 0), 0);
        const sorted = [...processed].sort((a, b) => Math.abs(b.gex || 0) - Math.abs(a.gex || 0));
        const top = sorted.slice(0, 5);
        const maxG = Math.abs(top[0]?.gex || 1);

        setResults({
          totalGex,
          regime: totalGex > 0 ? 'Estabilidade' : 'Volatilidade',
          pinRisk: 'Baixo',
          gammaWalls: top.map(o => ({
            strike: o.strike,
            strength: Math.round((Math.abs(o.gex || 0) / maxG) * 100),
            type: o.strike > spot ? 'Resistance' : 'Support'
          })),
          marketContext: `GEX Líquido: ${totalGex.toFixed(0)}`,
          signals: [{ direction: totalGex > 0 ? 'LONG' : 'SHORT', reason: 'Fluxo de Gamma Dealer', confidence: 0.8 }]
        });
        setOptions(processed);
        setError(null);
      } catch (err: any) {
        setError("Erro no cálculo.");
      } finally {
        setIsAnalyzing(false);
      }
    }, 400);
  };

  useEffect(() => {
    if (results && chartRef.current && (window as any).Plotly) {
      const calls = options.filter(o => o.tipo === 'CALL');
      const puts = options.filter(o => o.tipo === 'PUT');
      const data = [
        { x: calls.map(o => o.strike), y: calls.map(o => o.gex), name: 'Calls', type: 'bar', marker: { color: '#10b981' } },
        { x: puts.map(o => o.strike), y: puts.map(o => o.gex), name: 'Puts', type: 'bar', marker: { color: '#ef4444' } }
      ];
      const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' } },
        yaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' } },
        font: { color: '#f8fafc' },
        margin: { t: 10, b: 30, l: 50, r: 10 },
        height: 300
      };
      (window as any).Plotly.newPlot(chartRef.current, data, layout, { responsive: true, displayModeBar: false });
    }
  }, [results, options]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-black text-indigo-500 tracking-tighter">GEX TERMINAL <span className="text-white">PRO</span></h1>
          <p className="text-[10px] mono text-slate-500 uppercase tracking-widest">Local Engine v2.0</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-emerald-500 font-bold mono">● SYSTEM READY</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="glass-card p-6 rounded-3xl space-y-6">
          <h2 className="text-xs font-bold uppercase text-indigo-400">Parâmetros</h2>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Spot Price</label>
              <input type="number" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none" placeholder="Ex: 5200.00" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Importar Planilha</label>
              <input type="file" onChange={handleFileUpload} className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer" />
            </div>
            {error && <p className="text-[10px] text-red-500 mono">{error}</p>}
            <button onClick={runAnalysis} disabled={isAnalyzing} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-all disabled:opacity-50">
              {isAnalyzing ? "ANALISANDO..." : "CALCULAR EXPOSIÇÃO"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!results ? (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl text-slate-600">
              <p className="text-sm font-medium">Aguardando dados de mercado...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4 rounded-2xl">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Net GEX</p>
                  <p className={`text-xl font-bold mono ${results.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{results.totalGex.toLocaleString()}</p>
                </div>
                <div className="glass-card p-4 rounded-2xl">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Regime</p>
                  <p className="text-md font-bold text-indigo-400">{results.regime}</p>
                </div>
                <div className="glass-card p-4 rounded-2xl">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Pinning</p>
                  <p className="text-md font-bold text-slate-300">{results.pinRisk}</p>
                </div>
              </div>
              <div className="glass-card p-4 rounded-2xl">
                 <div ref={chartRef} className="w-full"></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Inicialização segura do React
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<GEXAnalyzer />);
}
