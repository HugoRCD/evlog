"use client";

import { AgentChat } from "@/app/_components/agent-chat";
import {
  EvlogEventsPanel,
  type LogsConnectionState,
} from "@/app/_components/evlog-events-panel";
import { EveLogo } from "@/app/_components/eve-logo";
import { useState } from "react";

/** Demo-only unified shell — chat + wide events from FS drain. */
export function DemoApp() {
  const [logsState, setLogsState] = useState<LogsConnectionState>("waiting");
  const [agentStatus, setAgentStatus] = useState("Ready");

  return (
    <div className="flex h-dvh flex-col bg-[#0c0c0c] text-zinc-100">
      <header className="flex h-11 shrink-0 items-center justify-between border-[#222] border-b px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <EveLogo size={16} />
          <span className="font-medium text-sm">Clearbill Support</span>
          <span className="text-[#444]">/</span>
          <span className="font-mono text-[11px] text-zinc-500">evlog × eve</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-500">
          <span>
            agent <span className="text-zinc-300">{agentStatus.toLowerCase()}</span>
          </span>
          <span>
            logs{" "}
            <span
              className={
                logsState === "live"
                  ? "text-emerald-400"
                  : logsState === "error"
                    ? "text-red-400"
                    : "text-zinc-400"
              }
            >
              {logsState}
            </span>
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_380px]">
        <section className="flex min-h-0 min-w-0 flex-col border-[#222] md:border-r">
          <div className="shrink-0 border-[#222] border-b px-4 py-2 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Chat
          </div>
          <AgentChat embedded onStatusChange={setAgentStatus} />
        </section>

        <section className="hidden min-h-0 flex-col md:flex">
          <div className="shrink-0 border-[#222] border-b px-4 py-2 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Wide events
          </div>
          <EvlogEventsPanel embedded onConnectionChange={setLogsState} />
        </section>
      </div>
    </div>
  );
}
