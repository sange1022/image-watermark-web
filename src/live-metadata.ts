import piexif from 'piexifjs';

const placeholder = '00000000-0000-0000-0000-000000000000';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
type Atom = { type: string; start: number; end: number; payload: number };
const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

// Only adapts small, unfragmented, tail-moov files produced by our encoder.
// AVFoundation owns the timed metadata sample layout; video muxing stays in Mediabunny.
export function boxes(data: Uint8Array, start = 0, end = data.length): Atom[] {
  const result: Atom[] = [];
  const v = view(data);
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) throw new Error('MOV atom truncated');
    let size = v.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new Error('MOV atom truncated');
      size = Number(v.getBigUint64(offset + 8)); header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error('Invalid MOV atom size');
    result.push({ type: decoder.decode(data.subarray(offset + 4, offset + 8)), start: offset, end: offset + size, payload: offset + header });
    offset += size;
  }
  return result;
}

function find(data: Uint8Array, path: string[], start = 0, end = data.length): Atom {
  const atom = boxes(data, start, end).find(a => a.type === path[0]);
  if (!atom) throw new Error(`MOV missing ${path.join('/')}`);
  return path.length === 1 ? atom : find(data, path.slice(1), atom.payload, atom.end);
}

function join(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function atom(type: string, content: Uint8Array) {
  const out = new Uint8Array(content.length + 8);
  view(out).setUint32(0, out.length);
  out.set(encoder.encode(type), 4); out.set(content, 8);
  return out;
}

function validateId(id: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid Live Photo identifier');
}

function binary(data: Uint8Array) {
  let result = '';
  for (let start = 0; start < data.length; start += 8192) result += String.fromCharCode(...data.subarray(start, start + 8192));
  return result;
}

export function pairJpeg(jpeg: Uint8Array, fixture: Uint8Array, id: string): Uint8Array {
  validateId(id);
  const note = piexif.load(binary(fixture)).Exif[37500];
  if (typeof note !== 'string' || !note.includes(placeholder)) throw new Error('Invalid Apple JPEG fixture');
  const exif = piexif.dump({ '0th': { 274: 1 }, Exif: { 37500: note.replace(placeholder, id), 40961: 1 } });
  return Uint8Array.from(piexif.insert(exif, binary(jpeg)), c => c.charCodeAt(0));
}

export function addStillTrack(video: Uint8Array, fixture: Uint8Array, id: string): Uint8Array {
  validateId(id);
  const top = boxes(video);
  const moov = find(video, ['moov']);
  if (top.at(-1) !== top.find(a => a.type === 'moov') || boxes(video, moov.payload, moov.end).filter(a => a.type === 'trak').length !== 1) throw new Error('Unsupported MOV layout');
  const movieHeader = find(video, ['moov', 'mvhd']);
  const fixtureHeader = find(fixture, ['moov', 'mvhd']);
  if (video[movieHeader.payload] !== 0 || fixture[fixtureHeader.payload] !== 0) throw new Error('Unsupported MOV time version');
  const timescale = view(video).getUint32(movieHeader.payload + 12);
  const fixtureTimescale = view(fixture).getUint32(fixtureHeader.payload + 12);
  const originalTrak = find(fixture, ['moov', 'trak']);
  const track = fixture.slice(originalTrak.start, originalTrak.end);
  const tv = view(track);
  const tkhd = find(track, ['trak', 'tkhd']);
  if (track[tkhd.payload] !== 0) throw new Error('Unsupported metadata track');
  tv.setUint32(tkhd.payload + 12, 2);
  tv.setUint32(tkhd.payload + 20, Math.round(tv.getUint32(tkhd.payload + 20) * timescale / fixtureTimescale));
  const edit = find(track, ['trak', 'edts', 'elst']);
  if (track[edit.payload] !== 0) throw new Error('Unsupported metadata edit');
  const edits = tv.getUint32(edit.payload + 4);
  for (let i = 0; i < edits; i++) {
    const p = edit.payload + 8 + i * 12;
    tv.setUint32(p, Math.round(tv.getUint32(p) * timescale / fixtureTimescale));
  }
  const oldData = find(fixture, ['mdat']);
  const stco = find(track, ['trak', 'mdia', 'minf', 'stbl', 'stco']);
  const chunks = tv.getUint32(stco.payload + 4);
  for (let i = 0; i < chunks; i++) {
    const p = stco.payload + 8 + i * 4;
    const oldOffset = tv.getUint32(p);
    if (oldOffset < oldData.payload || oldOffset >= oldData.end) throw new Error('Invalid metadata chunk');
    tv.setUint32(p, moov.start + 8 + oldOffset - oldData.payload);
  }
  const originalMeta = find(fixture, ['moov', 'meta']);
  const metadata = fixture.slice(originalMeta.start, originalMeta.end);
  const placeholderBytes = encoder.encode(placeholder);
  let replaced = false;
  for (let i = 0; i <= metadata.length - placeholderBytes.length; i++) {
    if (placeholderBytes.every((b, j) => metadata[i + j] === b)) { metadata.set(encoder.encode(id), i); replaced = true; break; }
  }
  if (!replaced) throw new Error('Invalid Apple MOV fixture');
  const movie = video.slice(moov.payload, moov.end);
  // Reserve track id 2 for metadata and move next_track_ID past both tracks.
  view(movie).setUint32(movieHeader.end - moov.payload - 4, 3);
  return join(video.subarray(0, moov.start), atom('mdat', fixture.subarray(oldData.payload, oldData.end)), atom('moov', join(movie, track, metadata)));
}
