import { createInterface } from 'node:readline';
import { TerminalStrudelPlayer, type PlaybackEvent } from './audio-player.ts';

type Command =
  | { type: 'play'; code: string }
  | { type: 'stop' }
  | { type: 'quit' };

function send(message: object) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const player = new TerminalStrudelPlayer((event: PlaybackEvent) => send({ type: 'event', event }));
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

async function main() {
  for await (const line of input) {
    try {
      const command: Command = JSON.parse(line);
      if (command.type === 'play') {
        await player.play(command.code);
        send({ type: 'playing' });
      } else if (command.type === 'stop') {
        player.pause();
        send({ type: 'stopped' });
      } else if (command.type === 'quit') {
        await player.close();
        send({ type: 'closed' });
        break;
      }
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  await player.close();
}

void main().catch((error) => {
  send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
