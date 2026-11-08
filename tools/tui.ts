import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadSongs, saveSong, slugify, type Song } from './song-library.ts';

const terminal = createInterface({ input, output });

const ask = (question: string) => terminal.question(question);
const clear = () => output.write('\x1Bc');

function displaySongs(songs: Song[]) {
  songs.forEach((song, index) => output.write(`${String(index + 1).padStart(2)}. ${song.title} — ${song.composer} [${song.key}, ${song.tempo} BPM]\n`));
}

async function chooseSong(songs: Song[], prompt = 'Número (Enter para cancelar): '): Promise<Song | undefined> {
  displaySongs(songs);
  const answer = await ask(prompt);
  const selected = songs[Number(answer) - 1];
  if (answer && !selected) output.write('Selección inválida.\n');
  return selected;
}

async function editSong(song: Song) {
  clear();
  output.write(`Editando ${song.title}. Deja vacío para conservar el valor actual.\n\n`);
  const title = await ask(`Título [${song.title}]: `);
  const composer = await ask(`Compositor/a [${song.composer}]: `);
  const key = await ask(`Tonalidad [${song.key}]: `);
  const tempo = await ask(`Tempo [${song.tempo}]: `);
  const form = await ask(`Forma [${song.form}]: `);
  const tags = await ask(`Etiquetas, separadas por coma [${song.tags.join(', ')}]: `);
  const license = await ask(`Licencia o permiso [${song.license}]: `);
  output.write('\nCódigo Strudel actual:\n---\n' + song.strudel + '\n---\n');
  const strudel = await ask('Código nuevo (una línea; Enter para conservar): ');
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
  output.write(`\n✓ Guardada en songs/${next.id}.json\n`);
}

async function createSong() {
  clear();
  output.write('Nueva canción (los campos marcados con * son obligatorios).\n\n');
  const title = await ask('Título*: ');
  const composer = await ask('Compositor/a*: ');
  const id = slugify(await ask(`ID [${slugify(title) || 'mi-cancion'}]: `)) || slugify(title);
  const tempo = Number(await ask('Tempo [120]: ')) || 120;
  const key = (await ask('Tonalidad [C major]: ')) || 'C major';
  const form = (await ask('Forma [AABA]: ')) || 'AABA';
  const tags = await ask('Etiquetas (separadas por coma): ');
  const license = await ask('Licencia o permiso*: ');
  const strudel = await ask('Código Strudel (una línea)*: ');
  if (!title || !composer || !id || !license || !strudel) {
    output.write('✗ Faltan campos obligatorios.\n');
    return;
  }
  await saveSong({ schemaVersion: 1, id, title, composer, key, tempo, form, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), license, strudel });
  output.write(`✓ Creada songs/${id}.json\n`);
}

async function main() {
  while (true) {
    clear();
    output.write('REALBOOK STRUDEL — TUI\n======================\n1. Buscar canciones\n2. Ver catálogo\n3. Editar canción\n4. Crear canción\n5. Ver código Strudel\n0. Salir\n\n');
    const choice = await ask('Opción: ');
    const songs = await loadSongs();
    if (choice === '0') break;
    if (choice === '1') {
      const query = (await ask('Buscar: ')).toLowerCase();
      const matches = songs.filter((song) => `${song.title} ${song.composer} ${song.tags.join(' ')}`.toLowerCase().includes(query));
      output.write(`\n${matches.length} resultado(s):\n`); displaySongs(matches);
    } else if (choice === '2') {
      output.write(`\n${songs.length} canción(es):\n`); displaySongs(songs);
    } else if (choice === '3') {
      const song = await chooseSong(songs); if (song) await editSong(song);
    } else if (choice === '4') {
      await createSong();
    } else if (choice === '5') {
      const song = await chooseSong(songs); if (song) output.write(`\n${song.title}\n---\n${song.strudel}\n---\n`);
    } else {
      output.write('Opción inválida.\n');
    }
    await ask('\nEnter para continuar…');
  }
  terminal.close();
}

main().catch((error) => { terminal.close(); console.error(error); process.exitCode = 1; });
