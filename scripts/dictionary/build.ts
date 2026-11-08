import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { MerkleTree } from 'merkletreejs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sha256(buf: Buffer): Buffer {
  return crypto.createHash('sha256').update(buf).digest()
}

export interface BuildDictionaryResult {
  wordCount: number
  rootHex: string
  depth: number
  validPrefixesCount: number
  flagsHex: string
  flagsBuffer: Buffer
  fitsInTransaction: boolean
  proofBytes: number
}

export function buildDictionary(
  wordsFilePath = path.join(__dirname, 'words.txt'),
  outputDir = path.join(__dirname, '../../public/dictionary'),
): BuildDictionaryResult {
  if (!fs.existsSync(wordsFilePath)) {
    throw new Error(`Words file not found at ${wordsFilePath}`)
  }

  const rawText = fs.readFileSync(wordsFilePath, 'utf-8')
  const rawWords = rawText.split(/\r?\n/).map((w) => w.trim().toLowerCase())

  // Filter: lowercase a-z only, minimum 3 letters, unique, sorted
  const words = Array.from(new Set(rawWords.filter((w) => /^[a-z]{3,}$/.test(w)))).sort()

  if (words.length === 0) {
    throw new Error('Filtered dictionary is empty; no valid words found.')
  }

  const leaves = words.map((w) => sha256(Buffer.from(w, 'utf8')))
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true })
  const rootHex = tree.getRoot().toString('hex')
  const depth = tree.getDepth()
  const layers = tree.getLayers()

  // 676-bit flags for 26x26 two-letter combinations
  const counts = new Array<number>(676).fill(0)
  for (const w of words) {
    const c0 = w.charCodeAt(0) - 97
    const c1 = w.charCodeAt(1) - 97
    const idx = c0 * 26 + c1
    counts[idx]++
  }

  const flagsBuffer = Buffer.alloc(85, 0) // 85 bytes * 8 bits = 680 bits
  const validPrefixes = new Set<string>()
  for (let i = 0; i < 676; i++) {
    if (counts[i] >= 10) {
      const c0 = String.fromCharCode(97 + Math.floor(i / 26))
      const c1 = String.fromCharCode(97 + (i % 26))
      validPrefixes.add(`${c0}${c1}`)

      const byteIdx = Math.floor(i / 8)
      const bitIdx = i % 8
      flagsBuffer[byteIdx] |= 1 << bitIdx
    }
  }
  const flagsHex = flagsBuffer.toString('hex')

  // Verify Solana transaction fit against the longest accepted word
  // Solana packet MTU: 1232 bytes
  // Action data: 1 byte word_len + max word bytes + 1 byte proof_len + proof bytes
  // Account keys + signatures + transaction header & blockhash overhead: ~256 bytes
  const maxWordLen = words.reduce((max, w) => Math.max(max, Buffer.byteLength(w, 'utf8')), 0)
  const proofBytes = depth * 32
  const actionPayloadSize = 1 + maxWordLen + 1 + proofBytes
  const estimatedTxSize = actionPayloadSize + 256
  const fitsInTransaction = estimatedTxSize <= 1232

  // Clean old shards
  const shardsDir = path.join(outputDir, 'shards')
  if (fs.existsSync(shardsDir)) {
    fs.rmSync(shardsDir, { recursive: true, force: true })
  }
  fs.mkdirSync(shardsDir, { recursive: true })

  // 1. root.json
  const rootMeta = {
    root: rootHex,
    depth,
    wordCount: words.length,
    validPrefixesCount: validPrefixes.size,
    flagsHex,
    proofBytes,
    fitsInTransaction,
  }
  fs.writeFileSync(path.join(outputDir, 'root.json'), JSON.stringify(rootMeta, null, 2))

  // 2. words.json (for bot vocabulary)
  fs.writeFileSync(path.join(outputDir, 'words.json'), JSON.stringify(words))

  // 3. Sharded per-word proofs:
  // - Prefixes with >= 10 words get dedicated shards (`<prefix>.json`, 257 files)
  // - Rare prefixes (< 10 words, like 'ng') are grouped in `_rare.json`
  // Keeps total file count at 258 shards (under repository review limits)
  const shards: Record<string, Record<string, string[]>> = {}
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const prefix = w.slice(0, 2)
    const shardKey = validPrefixes.has(prefix) ? prefix : '_rare'
    if (!shards[shardKey]) {
      shards[shardKey] = {}
    }

    const proof: string[] = []
    let idx = i
    for (let l = 0; l < layers.length - 1; l++) {
      const layer = layers[l]
      const sibIdx = idx ^ 1
      if (sibIdx < layer.length) {
        proof.push(layer[sibIdx].toString('hex'))
      }
      idx = Math.floor(idx / 2)
    }
    shards[shardKey][w] = proof
  }

  for (const shardKey of Object.keys(shards)) {
    fs.writeFileSync(path.join(shardsDir, `${shardKey}.json`), JSON.stringify(shards[shardKey]))
  }

  return {
    wordCount: words.length,
    rootHex,
    depth,
    validPrefixesCount: validPrefixes.size,
    flagsHex,
    flagsBuffer,
    fitsInTransaction,
    proofBytes,
  }
}

// Direct execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const wordsFile = process.argv[2] || path.join(__dirname, 'words.txt')
  const outDir = process.argv[3] || path.join(__dirname, '../../public/dictionary')
  console.log('Building dictionary Merkle tree and shard proofs...')
  const result = buildDictionary(wordsFile, outDir)
  console.log(`\n--- Dictionary Build Summary ---`)
  console.log(`Word list: ENABLE1 (Enhanced North American Benchmark Lexicon)`)
  console.log(`License: Public Domain (Alan Beale & M. Cooper)`)
  console.log(`Valid words (lowercase a-z, length >= 3): ${result.wordCount}`)
  console.log(`Merkle Root (SHA-256): ${result.rootHex}`)
  console.log(`Tree Depth: ${result.depth}`)
  console.log(`Proof Size: ${result.proofBytes} bytes (${result.depth} * 32 bytes)`)
  console.log(`Fits in Solana 1232-byte Transaction: ${result.fitsInTransaction ? 'YES' : 'NO'}`)
  console.log(`Valid 2-letter Prefixes (>= 10 words): ${result.validPrefixesCount} / 676`)
  console.log(`Prefix Flags Hex (85 bytes): ${result.flagsHex}`)
}
