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
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        const mapped = data.map((row: any) => ({
          ticker: row.ticker || 'ASSET',
          tipo: String(row.tipo || '').toUpperCase().includes('CALL') ? 'CALL' : 'PUT',
          strike: parseFloat(row.strike || 0),
          gamma: parseFloat(row.gamma || 0),
          oi: parseFloat(row.oi || 0),
        })).filter((o: any) => o.strike > 0);

        setOptions(mapped);
        setError(null);
      } catch (err) {
        setError("Erro ao processar planilha.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const calculate = () => {
    if (!currentPrice || options.length === 0) {
      setError("Preencha o preço e carregue a planilha.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const spot = parseFloat(currentPrice);
      const processed = options.map(o => ({
        ...o,
        gex: o.tipo === 'CALL' ? (o.gamma * o.oi * 100 * spot) : (-o.gamma * o.oi * 100 * spot)
      }));
      const total = processed.reduce((acc, curr) => acc + (curr.gex || 0), 0);
      setResults({ total, processed });
      setLoading(false);
    }, 300);
  };

  useEffect(() => {
    if (results && chartRef.current && (window as any).Plotly) {
      const data = [
        {
          x: results.processed.filter((o: any) => o.tipo === 'CALL').map((o: any) => o.strike),
          y: results.processed.filter((o: any) => o.tipo === 'CALL').map((o: any) => o.gex),
          name: 'Call GEX', type: 'bar', marker: { color: '#10b981' }
        },
        {
          x: results.processed.filter((o: any) => o.tipo === 'PUT').map((o: any) => o.strike),
          y: results.processed.filter((o: any) => o.tipo === 'PUT').map((o: any) => o.gex),
          name: 'Put GEX', type: 'bar', marker: { color: '#ef4444' }
        }
      ];
      (window as any).Plotly.newPlot(chartRef.current, data, {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8', size: 10 },
        margin: { t: 10, r: 10, b: 40, l: 50 }
      }, { responsive: true, displayModeBar: false });
    }
  }, [results]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-indigo-500">GEX ANALYZER PRO</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Quantitative Terminal v2.1</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-3xl space-y-4">
          <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Configuração</h2>
          <div className="space-y-4">
            <input 
              type="number" 
              placeholder="Preço Spot (Ex: 5000)" 
              value={currentPrice}
              onChange={e => setCurrentPrice(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
            <div className="border border-dashed border-slate-700 rounded-xl p-4 text-center">
              <input type="file" onChange={handleFile} className="text-[10px] text-slate-500 cursor-pointer" />
            </div>
            {error && <p className="text-[10px] text-red-500 font-mono">{error}</p>}
            <button 
              onClick={calculate}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            >
              {loading ? "CALCULANDO..." : "EXECUTAR ANALISE"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!results ? (
            <div className="glass h-[400px] rounded-3xl flex items-center justify-center">
              <p className="text-slate-600 text-sm font-medium">Aguardando dados...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass p-4 rounded-2xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Net Exposure</span>
                  <span className={`text-xl font-mono font-bold ${results.total > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {results.total.toLocaleString()}
                  </span>
                </div>
                <div className="glass p-4 rounded-2xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Market Regime</span>
                  <span className="text-xl font-bold text-white">{results.total > 0 ? 'Estável' : 'Volátil'}</span>
                </div>
              </div>
              <div className="glass p-4 rounded-3xl">
                <div ref={chartRef} className="w-full h-[300px]"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<GEXAnalyzer />);