import { loadSongs } from './song-library.ts';

try {
  const songs = await loadSongs();
  const duplicateIds = songs.filter((song, index) => songs.findIndex((candidate) => candidate.id === song.id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate IDs: ${duplicateIds.map((song) => song.id).join(', ')}`);
  console.log(`✓ ${songs.length} valid song(s).`);
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
