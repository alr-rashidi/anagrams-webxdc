import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Input text file path (default: words.txt or provided via CLI argument)
const inputFilePath = process.argv[2] || './words.txt';

if (!fs.existsSync(inputFilePath)) {
  console.error(`Error: Text file "${inputFilePath}" not found!`);
  console.error('Please create a plain text file containing one word per line.');
  process.exit(1);
}

console.log(`Reading words from text file: ${inputFilePath}`);
const fileData = fs.readFileSync(inputFilePath, 'utf-8');

// Function to clean and sanitize Persian words
function cleanWord(str) {
  return str
    .toLowerCase()
    .replace(/[0-9\s‌\-\._#]/g, '')
    .trim();
}

const wordSet = new Set();

// Read line by line
const lines = fileData.split(/\r?\n/);
lines.forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return; // ignore empty lines and comments
  
  const cleaned = cleanWord(trimmed);
  if (cleaned.length >= 2) {
    wordSet.add(cleaned);
  }
});

const wordList = Array.from(wordSet).sort();
console.log(`Extracted ${wordList.length} unique words from ${inputFilePath}.`);

// Compress using gzip (NULL-separated)
const text = wordList.join('\0');
const compressed = zlib.gzipSync(Buffer.from(text, 'utf-8'));
const base64 = compressed.toString('base64');

const fileContent = `// Auto-generated Persian packed dictionary
export const packedDict = "${base64}";

export async function decompressDict() {
  try {
    const binary = Uint8Array.from(atob(packedDict), c => c.charCodeAt(0));
    const ds = new DecompressionStream('gzip');
    const stream = new Response(binary).body.pipeThrough(ds);
    const text = await new Response(stream).text();
    const words = text.split('\\0').map(w => w.trim()).filter(Boolean);
    return new Set(words);
  } catch (err) {
    console.error('Error decompressing dictionary:', err);
    return new Set();
  }
}
`;

// Write output files
const outputPath1 = './dictionary.packed.js';
const outputPath2 = './src/dictionary.packed.js';

fs.writeFileSync(outputPath1, fileContent);
if (fs.existsSync('./src')) {
  fs.writeFileSync(outputPath2, fileContent);
}

console.log(`Successfully generated dictionary.packed.js from "${inputFilePath}".`);
