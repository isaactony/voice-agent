import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const agentsEntry = require.resolve('@livekit/agents');
const targetPath = path.join(path.dirname(agentsEntry), 'inference', 'tts.js');
const marker = 'Ignoring unsupported TTS websocket event type';

const original = fs.readFileSync(targetPath, 'utf8');

if (original.includes(marker)) {
  console.log('[worker:postinstall] livekit tts compatibility patch already applied');
  process.exit(0);
}

const from = `const validatedEvent = ttsServerEventSchema.parse(eventJson);
          void eventChannel.write(validatedEvent).catch((error) => {`;

const to = `const parsedEvent = ttsServerEventSchema.safeParse(eventJson);
          if (!parsedEvent.success) {
            const firstIssue = parsedEvent.error.issues == null ? void 0 : parsedEvent.error.issues[0];
            if (firstIssue && firstIssue.code === "invalid_union_discriminator") {
              this.#logger.debug(
                { eventType: eventJson == null ? void 0 : eventJson.type },
                "Ignoring unsupported TTS websocket event type"
              );
              return;
            }
            this.#logger.error({ error: parsedEvent.error }, "Error parsing WebSocket message");
            return;
          }
          const validatedEvent = parsedEvent.data;
          void eventChannel.write(validatedEvent).catch((error) => {`;

if (!original.includes(from)) {
  console.warn('[worker:postinstall] livekit tts compatibility patch skipped: source pattern not found');
  process.exit(0);
}

fs.writeFileSync(targetPath, original.replace(from, to), 'utf8');
console.log('[worker:postinstall] applied livekit tts compatibility patch');
