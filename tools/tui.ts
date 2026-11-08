import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadSongs, saveSong, slugify, type Song } from './song-library.ts';

const terminal = createInterface({ input, output });

const ask = (question: string) => terminal.question(question);
const clear = () => output.write('\x1Bc');

function displaySongs(songs: Song[]) {
  songs.forEach((song, index) => output.write(`${String(index + 1).padStart(2)}. ${song.title} — ${song.composer} [${song.key}, ${song.tempo} BPM]\n`));
}

async function chooseSong(songs: Song[], prompt = 'Number (Enter to cancel): '): Promise<Song | undefined> {
  displaySongs(songs);
  const answer = await ask(prompt);
  const selected = songs[Number(answer) - 1];
  if (answer && !selected) output.write('Invalid selection.\n');
  return selected;
}

async function editSong(song: Song) {
  clear();
  output.write(`Editing ${song.title}. Leave blank to keep the current value.\n\n`);
  const title = await ask(`Title [${song.title}]: `);
  const composer = await ask(`Composer [${song.composer}]: `);
  const key = await ask(`Key [${song.key}]: `);
  const tempo = await ask(`Tempo [${song.tempo}]: `);
  const form = await ask(`Form [${song.form}]: `);
  const tags = await ask(`Tags, comma separated [${song.tags.join(', ')}]: `);
  const license = await ask(`License or permission [${song.license}]: `);
  output.write('\nCurrent Strudel code:\n---\n' + song.strudel + '\n---\n');
  const strudel = await ask('New code (one line; Enter to keep): ');
  const next: Song = {
    ...song,
    title: title || song.title,
    composer: composer || song.composer,
    key: key || song.key,
    tempo: tempo ? Number(tempo) : song.tempo,
    form: form || song.form,
    tags: tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : song.tags,
    license: license || song.license,
    strudel: strudel || song.strudel,
  };
  await saveSong(next);
  output.write(`\n✓ Saved to songs/${next.id}.json\n`);
}

async function createSong() {
  clear();
  output.write('New song (fields marked with * are required).\n\n');
  const title = await ask('Title*: ');
  const composer = await ask('Composer*: ');
  const id = slugify(await ask(`ID [${slugify(title) || 'my-song'}]: `)) || slugify(title);
  const tempo = Number(await ask('Tempo [120]: ')) || 120;
  const key = (await ask('Key [C major]: ')) || 'C major';
  const form = (await ask('Form [AABA]: ')) || 'AABA';
  const tags = await ask('Tags (comma separated): ');
  const license = await ask('License or permission*: ');
  const strudel = await ask('Strudel code (one line)*: ');
  if (!title || !composer || !id || !license || !strudel) {
    output.write('✗ Required fields are missing.\n');
    return;
  }
  await saveSong({ schemaVersion: 1, id, title, composer, key, tempo, form, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), license, strudel });
  output.write(`✓ Creada songs/${id}.json\n`);
}

async function main() {
  while (true) {
    clear();
    output.write('REALBOOK STRUDEL — TUI\n======================\n1. Search songs\n2. View catalog\n3. Edit song\n4. Create song\n5. View Strudel code\n0. Exit\n\n');
    const choice = await ask('Option: ');
    const songs = await loadSongs();
    if (choice === '0') break;
    if (choice === '1') {
      const query = (await ask('Search: ')).toLowerCase();
      const matches = songs.filter((song) => `${song.title} ${song.composer} ${song.tags.join(' ')}`.toLowerCase().includes(query));
      output.write(`\n${matches.length} result(s):\n`); displaySongs(matches);
    } else if (choice === '2') {
      output.write(`\n${songs.length} song(s):\n`); displaySongs(songs);
    } else if (choice === '3') {
      const song = await chooseSong(songs); if (song) await editSong(song);
    } else if (choice === '4') {
      await createSong();
    } else if (choice === '5') {
      const song = await chooseSong(songs); if (song) output.write(`\n${song.title}\n---\n${song.strudel}\n---\n`);
    } else {
      output.write('Invalid option.\n');
    }
    await ask('\nPress Enter to continue…');
  }
  terminal.close();
}

main().catch((error) => { terminal.close(); console.error(error); process.exitCode = 1; });
