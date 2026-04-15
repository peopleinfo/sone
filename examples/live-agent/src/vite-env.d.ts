/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_GATEWAY_API_KEY?: string;
  readonly VITE_AI_GATEWAY_MODEL?: string;
  readonly VITE_AI_GATEWAY_URL?: string;
  readonly VITE_LIVE_AGENT_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
