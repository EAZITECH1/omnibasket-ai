'use client';

import React, { useState } from 'react';
import Navbar from '../../components/Navbar';
import { 
  Bot, 
  Cpu, 
  Lock, 
  Unlock, 
  Zap, 
  ShieldCheck, 
  CheckCircle2, 
  Play, 
  ExternalLink,
  Activity,
  Terminal
} from 'lucide-react';

export default function AgentStudioPage() {
  const [runningAgentCycle, setRunningAgentCycle] = useState(false);
  const [agentReport, setAgentReport] = useState(null);
  const [testingX402, setTestingX402] = useState(false);
  const [x402TraceData, setX402TraceData] = useState(null);

  const handleRunAgentCycle = async () => {
    setRunningAgentCycle(true);
    try {
      const res = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basketId: 'ai-supercycle',
          depositAmount: 25
        })
      });
      const data = await res.json();
      if (data.success) {
        setAgentReport(data.report);
      } else {
        alert(`Agent cycle error: ${data.error || 'Failed to complete autonomous cycle'}`);
      }
    } catch (e) {
      alert(`Agent cycle network error: ${e.message}`);
    }
    setRunningAgentCycle(false);
  };

  const handleTestX402 = async () => {
    setTestingX402(true);
    setX402TraceData(null);
    try {
      const res = await fetch('/api/agent/x402-demo', {
        method: 'POST'
      });
      const data = await res.json();
      setX402TraceData(data);
    } catch (e) {
      alert(`x402 protocol error: ${e.message}`);
    }
    setTestingX402(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true"></div>

        {/* Header */}
        <div className="mb-8 border-b-2 border-foreground pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-bnb-yellow" />
              <h1 className="text-2xl font-black uppercase tracking-wider sm:text-3xl">
                Binance Agent Studio & x402 Micropayments
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Autonomous ERC-8004 Sentinel Agent with HTTP 402 gasless payment protocol on BNB Smart Chain.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestX402}
              disabled={testingX402}
              className="border-2 border-foreground bg-background px-4 py-2 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 cursor-pointer shadow-[var(--shadow-box-sm)]"
            >
              <Zap className={`w-3.5 h-3.5 fill-current ${testingX402 ? 'animate-bounce' : ''}`} />
              <span>{testingX402 ? 'Simulating 402 Challenge...' : 'Trigger Live x402 Challenge'}</span>
            </button>

            <button
              onClick={handleRunAgentCycle}
              disabled={runningAgentCycle}
              className="border-2 border-foreground bg-bnb-yellow text-black px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-white transition-all shadow-[var(--shadow-box-sm)] flex items-center gap-2 cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${runningAgentCycle ? 'animate-spin' : ''}`} />
              <span>{runningAgentCycle ? 'Running Cycle...' : 'Run Autonomous Cycle'}</span>
            </button>
          </div>
        </div>

        {/* 2-Column Studio Layout */}
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* Left Column: x402 Trace & Protocol Flow (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Protocol Card */}
            <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)]">
              <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                  <Lock className="w-4 h-4 text-bnb-yellow" />
                  <span>x402 Protocol Cryptographic State</span>
                </div>
                <span className="text-[10px] font-mono border border-foreground bg-foreground text-background px-1.5 py-0.5 font-bold">
                  EIP-3009 Standard
                </span>
              </div>

              <p className="text-xs text-muted-foreground font-mono leading-relaxed mb-6">
                When an autonomous agent requires premium alpha data, the resource server returns an <b>HTTP 402 Payment Required</b> challenge. The agentic wallet verifies the challenge, signs an off-chain EIP-3009 payment signature, and completes the request with zero user intervention.
              </p>

              {/* 5-Step Trace Visualizer */}
              <div className="space-y-3 font-mono text-xs">
                {[
                  { step: '1', title: 'GET /api/rwa/alpha-feed', status: 'CHALLENGE_RECEIVED (HTTP 402)', color: 'text-amber-400' },
                  { step: '2', title: 'PARSE PAYMENT REQUIREMENTS', status: 'eip155:56 / 0.01 USDT', color: 'text-cyan-400' },
                  { step: '3', title: 'BAW PAYMENT PREVIEW', status: 'READY_TO_SIGN (EIP-3009)', color: 'text-purple-400' },
                  { step: '4', title: 'GENERATE PAYMENT SIGNATURE', status: 'PAYMENT-SIGNATURE HEADER READY', color: 'text-emerald-400' },
                  { step: '5', title: 'REPLAY PROTECTED RESOURCE', status: '200 OK · ALPHA FEED UNLOCKED', color: 'text-bnb-yellow' }
                ].map((s) => (
                  <div key={s.step} className="border border-foreground bg-background p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center bg-foreground text-background text-[10px] font-bold">
                        {s.step}
                      </span>
                      <span className="font-bold text-foreground">{s.title}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${s.color}`}>
                      {x402TraceData ? 'VERIFIED ✓' : s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Trace Output */}
            {x402TraceData && (
              <div className="border-2 border-emerald-400 bg-emerald-950/20 p-5 shadow-[var(--shadow-box-sm)]">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/30 pb-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>x402 Micropayment Unlocked Successfully</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-300 font-bold">
                    Cost: 0.01 USDT
                  </span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="text-emerald-300 font-bold">Alpha Intelligence Signal:</div>
                  <p className="text-muted-foreground">{x402TraceData.data?.signalSummary}</p>
                  <div className="mt-2 text-[10px] text-muted-foreground break-all">
                    Signature snippet: {x402TraceData.trace?.steps?.[3]?.headerValueSnippet}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Autonomous Sentinel Workflow (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Sentinel Spec */}
            <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)]">
              <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                  <Bot className="w-4 h-4 text-bnb-yellow" />
                  <span>Autonomous Sentinel Engine</span>
                </div>
                <span className="text-[10px] font-mono border border-foreground bg-card px-1.5 py-0.5 text-bnb-yellow font-bold">
                  ERC-8004
                </span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="border border-muted p-3 bg-background">
                  <div className="text-[10px] text-muted-foreground uppercase">Agent Identity</div>
                  <div className="font-bold text-foreground">OmniBasket Sentinel AI #56</div>
                  <div className="text-[10px] text-bnb-yellow">0x03A4...5283</div>
                </div>

                <div className="border border-muted p-3 bg-background">
                  <div className="text-[10px] text-muted-foreground uppercase">Autonomous Capabilities</div>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    <li>• Periodic portfolio drift calculation</li>
                    <li>• Micropayment negotiation via x402</li>
                    <li>• Calldata simulation on BSC state</li>
                    <li>• Non-custodial DEX execution via baw</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Agent Cycle Output */}
            {agentReport && (
              <div className="border-2 border-bnb-yellow bg-card p-5 shadow-[var(--shadow-box-sm)]">
                <h4 className="font-mono font-black text-sm uppercase text-bnb-yellow mb-2">
                  Autonomous Cycle Complete ({agentReport.cycleId})
                </h4>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Basket:</span>
                    <span className="font-bold">{agentReport.portfolio?.targetBasket}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Drift:</span>
                    <span className="text-amber-400 font-bold">{agentReport.portfolio?.maxDriftPercent}%</span>
                  </div>
                  <p className="mt-2 text-muted-foreground text-[11px] leading-relaxed">
                    {agentReport.recommendation}
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}
