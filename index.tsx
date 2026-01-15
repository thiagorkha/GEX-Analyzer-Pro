
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Initialization of Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

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

  // File parsing logic
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
          ticker: row.ticker || row.symbol || row.ativo || '',
          tipo: (row.tipo || row.type || '').toUpperCase() === 'CALL' ? 'CALL' : 'PUT',
          strike: parseFloat(row.strike || row.strike_price || 0),
          gamma: parseFloat(row.gamma || row.gamma_value || 0),
          oi: parseFloat(row.oi || row.open_interest || row.volume || 0),
        })).filter((o: OptionData) => o.strike > 0 && o.oi > 0);

        if (mappedData.length === 0) throw new Error("Nenhum dado válido de opções encontrado.");
        
        setOptions(mappedData);
        setError(null);
      } catch (err: any) {
        setError("Erro ao ler arquivo: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const runAnalysis = async () => {
    if (!currentPrice || options.length === 0) {
      setError("Insira o preço atual e carregue as opções.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Step 1: Manual Calculation for basic GEX
      const spot = parseFloat(currentPrice.toString());
      const processedOptions = options.map(o => ({
        ...o,
        gex: o.tipo === 'CALL' ? (o.gamma * o.oi * 100 * spot) : (-o.gamma * o.oi * 100 * spot)
      }));

      const totalGex = processedOptions.reduce((acc, curr) => acc + (curr.gex || 0), 0);

      // Step 2: Gemini Analysis for Market Intelligence
      const prompt = `Analise os seguintes dados de Gamma Exposure (GEX) para o ativo com preço atual ${spot} e vencimento em ${expiryDate}.
      Dados: ${JSON.stringify(processedOptions.slice(0, 50))} (mostrando top 50 strikes).
      Total GEX: ${totalGex}.
      
      Forneça uma análise profissional em JSON incluindo:
      - regime: 'Bullish', 'Bearish' ou 'Ranging'
      - pinRisk: 'Baixo', 'Médio' ou 'Alto'
      - marketContext: Um resumo de 2 frases sobre a situação técnica
      - signals: Um array de sinais com direction (LONG/SHORT/NEUTRAL), reason e confidence (0-1)
      - gammaWalls: Array de strikes com strength (0-100) e type (Resistance/Support)`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              regime: { type: Type.STRING },
              pinRisk: { type: Type.STRING },
              marketContext: { type: Type.STRING },
              signals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    direction: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    confidence: { type: Type.NUMBER }
                  }
                }
              },
              gammaWalls: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    strike: { type: Type.NUMBER },
                    strength: { type: Type.NUMBER },
                    type: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const aiData = JSON.parse(response.text || "{}");
      
      setResults({
        totalGex,
        regime: aiData.regime || (totalGex > 0 ? 'Bullish' : 'Bearish'),
        pinRisk: aiData.pinRisk || 'Baixo',
        gammaWalls: aiData.gammaWalls || [],
        marketContext: aiData.marketContext || "Análise concluída com base nos dados de exposição líquida.",
        signals: aiData.signals || []
      });

      setOptions(processedOptions);
    } catch (err: any) {
      setError("Falha na análise inteligente: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (results && chartRef.current) {
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
        title: { text: 'Exposição Gamma por Strike', font: { color: '#f8fafc' } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' } },
        yaxis: { gridcolor: '#1e293b', tickfont: { color: '#94a3b8' } },
        legend: { font: { color: '#f8fafc' } },
        margin: { t: 40, b: 40, l: 60, r: 20 },
        height: 350
      };

      (window as any).Plotly.newPlot(chartRef.current, [trace1, trace2], layout, { responsive: true });
    }
  }, [results, options]);

  const loadExample = () => {
    setCurrentPrice(100.0);
    const mockOptions: OptionData[] = [
      { ticker: 'SPY', tipo: 'CALL', strike: 95, gamma: 0.05, oi: 1000 },
      { ticker: 'SPY', tipo: 'CALL', strike: 100, gamma: 0.25, oi: 5000 },
      { ticker: 'SPY', tipo: 'CALL', strike: 105, gamma: 0.15, oi: 3000 },
      { ticker: 'SPY', tipo: 'PUT', strike: 95, gamma: 0.10, oi: 2000 },
      { ticker: 'SPY', tipo: 'PUT', strike: 100, gamma: 0.20, oi: 4500 },
      { ticker: 'SPY', tipo: 'PUT', strike: 90, gamma: 0.02, oi: 1000 },
    ];
    setOptions(mockOptions);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">GEX ANALYZER <span className="text-indigo-500">PRO</span></h1>
              <p className="text-[10px] mono text-slate-500 uppercase tracking-widest">Advanced Quantitative Terminal</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-400">
            <button className="hover:text-white transition-colors">Dashboard</button>
            <button className="hover:text-white transition-colors">Opções</button>
            <button className="hover:text-white transition-colors">Configurações</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar / Inputs */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
              Entrada de Dados
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Preço Atual Spot</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <input 
                    type="number" 
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-8 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Data de Vencimento</label>
                <input 
                  type="date" 
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Dados de Opções</label>
                <div 
                  className="border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center hover:border-indigo-500/50 hover:bg-slate-900/50 transition-all cursor-pointer relative"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                  />
                  <svg className="w-8 h-8 text-slate-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p className="text-sm font-medium">{options.length > 0 ? `${options.length} strikes carregados` : "Clique para carregar Excel"}</p>
                  <p className="text-xs text-slate-600 mt-1">Colunas: ticker, tipo, strike, gamma, OI</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={runAnalysis}
                  disabled={isAnalyzing}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      ANALISAR GEX
                    </>
                  )}
                </button>
                <button 
                  onClick={loadExample}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
                  title="Carregar Dados de Exemplo"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Dashboard Area */}
        <section className="lg:col-span-8 space-y-6">
          {!results ? (
            <div className="h-[600px] glass-card rounded-2xl flex flex-col items-center justify-center text-center p-12 space-y-6">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">Aguardando Dados</h3>
                <p className="text-slate-500 max-w-sm">Carregue suas opções e defina o preço do ativo para visualizar a análise detalhada de Gamma Exposure.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Widgets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-indigo-500">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Total Net GEX</p>
                  <p className={`text-2xl font-bold mono ${results.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {results.totalGex.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-amber-500">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Market Regime</p>
                  <p className="text-2xl font-bold text-amber-400">{results.regime}</p>
                </div>
                <div className="glass-card p-5 rounded-2xl border-l-4 border-l-purple-500">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Pin Risk</p>
                  <p className="text-2xl font-bold text-purple-400">{results.pinRisk}</p>
                </div>
              </div>

              {/* Chart Card */}
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold">Distribuição de Exposição</h3>
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 px-2 py-1 bg-emerald-400/10 rounded-full">CALLS</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 px-2 py-1 bg-rose-400/10 rounded-full">PUTS</span>
                  </div>
                </div>
                <div ref={chartRef} className="w-full"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gamma Walls */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Gamma Walls
                  </h3>
                  <div className="space-y-3">
                    {results.gammaWalls.length > 0 ? results.gammaWalls.map((wall, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase">{wall.type}</p>
                          <p className="text-lg font-bold mono">${wall.strike.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-500 uppercase">Power</p>
                          <div className="w-24 h-2 bg-slate-800 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${wall.type === 'Resistance' ? 'bg-indigo-500' : 'bg-emerald-500'}`} style={{ width: `${wall.strength}%` }}></div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500 italic">Nenhuma parede detectada nos strikes carregados.</p>
                    )}
                  </div>
                </div>

                {/* Trading Signals */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Sinais do Modelo
                  </h3>
                  <div className="space-y-4">
                    {results.signals.length > 0 ? results.signals.map((signal, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                            signal.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 
                            signal.direction === 'SHORT' ? 'bg-rose-500/20 text-rose-400' : 
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {signal.direction}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">CONFIDÊNCIA: {(signal.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-300">{signal.reason}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500 italic">Aguardando processamento do modelo.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Market Context AI Card */}
              <div className="glass-card rounded-2xl p-6 border-t-4 border-t-indigo-500 bg-indigo-500/5">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Contexto de Mercado (Gemini AI)
                </h3>
                <p className="text-sm text-slate-300 italic">"{results.marketContext}"</p>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />
      </div>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-slate-600 text-xs">
        <p>© 2024 GEX ANALYZER TERMINAL. Todos os dados são processados localmente. Powered by Gemini Pro.</p>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<GEXAnalyzer />);
