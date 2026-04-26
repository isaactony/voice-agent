'use client';

import { type AgentState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator';
import { cn } from '@/lib/shadcn/utils';

type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'unknown';

const sessionLabelMap: Record<SessionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  unknown: 'Unknown',
};

const agentLabelMap: Record<AgentState, string> = {
  initializing: 'Initializing',
  idle: 'Idle',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  disconnected: 'Disconnected',
  failed: 'Error',
  'pre-connect-buffering': 'Preparing audio',
};

function toSessionStatus(connectionState: ConnectionState): SessionStatus {
  switch (connectionState) {
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Reconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
      return 'disconnected';
    default:
      return 'unknown';
  }
}

interface AgentStatePanelProps {
  connectionState: ConnectionState;
  agentState: AgentState;
  className?: string;
}

export function AgentStatePanel({ connectionState, agentState, className }: AgentStatePanelProps) {
  const sessionStatus = toSessionStatus(connectionState);
  const isError = agentState === 'failed';
  const isThinking = agentState === 'thinking';

  return (
    <div
      className={cn(
        'bg-background/92 border-border/70 absolute top-4 right-4 z-[60] w-[240px] rounded-xl border p-3 shadow-lg backdrop-blur',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Agent status
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Session</span>
        <span className="text-xs font-semibold">{sessionLabelMap[sessionStatus]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Agent</span>
        <span
          className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', isError && 'text-destructive')}
        >
          {isThinking && <AgentChatIndicator size="sm" className="bg-foreground/60 size-2" />}
          {agentLabelMap[agentState]}
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            agentState === 'listening' && 'w-2/5 bg-emerald-500',
            agentState === 'thinking' && 'w-3/5 bg-amber-500',
            agentState === 'speaking' && 'w-full bg-sky-500',
            agentState === 'connecting' && 'w-1/4 bg-violet-500',
            agentState === 'pre-connect-buffering' && 'w-1/3 bg-indigo-500',
            agentState === 'failed' && 'w-full bg-red-500',
            agentState === 'disconnected' && 'w-0'
          )}
        />
      </div>
    </div>
  );
}
