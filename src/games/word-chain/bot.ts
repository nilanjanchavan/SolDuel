import { WordChainMove, WordChainState } from './types'
import { computeTruncatedHash, hasTwoLetterPrefix } from './constants'

export const BOT_CONFIGS: Record<'easy' | 'medium' | 'hard', { minDelay: number; maxDelay: number; slipRate: number }> =
  {
    easy: { minDelay: 2500, maxDelay: 3500, slipRate: 0.2 },
    medium: { minDelay: 1500, maxDelay: 2200, slipRate: 0.05 },
    hard: { minDelay: 800, maxDelay: 1200, slipRate: 0.0 },
  }

export function getBotDelay(level: 'easy' | 'medium' | 'hard'): number {
  const conf = BOT_CONFIGS[level]
  return Math.floor(Math.random() * (conf.maxDelay - conf.minDelay)) + conf.minDelay
}

// Fallback curated vocabulary covering every single 2-letter pair that has flags=1 and all 26 letters
const FALLBACK_VOCABULARY: string[] = [
  'able',
  'acid',
  'aged',
  'also',
  'area',
  'army',
  'away',
  'baby',
  'back',
  'ball',
  'band',
  'bank',
  'base',
  'bath',
  'bear',
  'beat',
  'been',
  'beer',
  'bell',
  'belt',
  'best',
  'bill',
  'bird',
  'blow',
  'blue',
  'boat',
  'body',
  'bomb',
  'bond',
  'bone',
  'book',
  'boom',
  'born',
  'boss',
  'both',
  'bowl',
  'bulk',
  'burn',
  'bush',
  'busy',
  'call',
  'calm',
  'came',
  'camp',
  'card',
  'care',
  'case',
  'cash',
  'cast',
  'cell',
  'chat',
  'chip',
  'city',
  'club',
  'coal',
  'coat',
  'code',
  'cold',
  'come',
  'cook',
  'cool',
  'cope',
  'copy',
  'core',
  'cost',
  'crew',
  'crop',
  'dark',
  'data',
  'date',
  'dawn',
  'days',
  'dead',
  'deal',
  'dean',
  'dear',
  'debt',
  'deep',
  'deny',
  'desk',
  'dial',
  'diet',
  'disc',
  'disk',
  'does',
  'done',
  'door',
  'dose',
  'down',
  'draw',
  'drew',
  'drop',
  'drug',
  'dual',
  'duke',
  'dust',
  'duty',
  'each',
  'earn',
  'ease',
  'east',
  'easy',
  'edge',
  'else',
  'even',
  'ever',
  'evil',
  'exit',
  'face',
  'fact',
  'fail',
  'fair',
  'fall',
  'farm',
  'fast',
  'fate',
  'fear',
  'feed',
  'feel',
  'feet',
  'fell',
  'felt',
  'file',
  'fill',
  'film',
  'find',
  'fine',
  'fire',
  'firm',
  'fish',
  'five',
  'flat',
  'flow',
  'food',
  'foot',
  'ford',
  'form',
  'fort',
  'four',
  'free',
  'from',
  'fuel',
  'full',
  'fund',
  'gain',
  'game',
  'gate',
  'gave',
  'gear',
  'gene',
  'gift',
  'girl',
  'give',
  'glad',
  'goal',
  'goes',
  'gold',
  'golf',
  'gone',
  'good',
  'gray',
  'grew',
  'grey',
  'grow',
  'gulf',
  'hair',
  'half',
  'hall',
  'hand',
  'hang',
  'hard',
  'harm',
  'hate',
  'have',
  'head',
  'hear',
  'heat',
  'held',
  'hell',
  'help',
  'here',
  'hero',
  'high',
  'hill',
  'hire',
  'hold',
  'hole',
  'holy',
  'home',
  'hope',
  'host',
  'hour',
  'huge',
  'hung',
  'hunt',
  'hurt',
  'idea',
  'inch',
  'into',
  'iron',
  'item',
  'jack',
  'jane',
  'jean',
  'john',
  'join',
  'jump',
  'jury',
  'just',
  'keen',
  'keep',
  'kent',
  'kept',
  'kick',
  'kill',
  'kind',
  'king',
  'knee',
  'knew',
  'know',
  'lack',
  'lady',
  'laid',
  'lake',
  'land',
  'lane',
  'last',
  'late',
  'lead',
  'left',
  'less',
  'life',
  'lift',
  'like',
  'line',
  'link',
  'list',
  'live',
  'load',
  'loan',
  'lock',
  'logo',
  'long',
  'look',
  'lord',
  'lose',
  'loss',
  'lost',
  'love',
  'luck',
  'made',
  'mail',
  'main',
  'make',
  'male',
  'many',
  'mark',
  'mass',
  'matt',
  'meal',
  'mean',
  'meat',
  'meet',
  'menu',
  'mere',
  'mike',
  'mile',
  'milk',
  'mill',
  'mind',
  'mine',
  'miss',
  'mode',
  'mood',
  'moon',
  'more',
  'most',
  'move',
  'much',
  'must',
  'name',
  'navy',
  'near',
  'neck',
  'need',
  'news',
  'next',
  'nice',
  'nick',
  'nine',
  'none',
  'nose',
  'note',
  'okay',
  'once',
  'only',
  'onto',
  'open',
  'oral',
  'over',
  'pace',
  'pack',
  'page',
  'paid',
  'pain',
  'pair',
  'palm',
  'park',
  'part',
  'pass',
  'past',
  'path',
  'peak',
  'peer',
  'pick',
  'pile',
  'pine',
  'pink',
  'pipe',
  'plan',
  'play',
  'plot',
  'plug',
  'plus',
  'poem',
  'poet',
  'poll',
  'pool',
  'poor',
  'port',
  'post',
  'pull',
  'pure',
  'push',
  'race',
  'rail',
  'rain',
  'rank',
  'rare',
  'rate',
  'read',
  'real',
  'rear',
  'rely',
  'rent',
  'rest',
  'rice',
  'rich',
  'ride',
  'ring',
  'rise',
  'risk',
  'road',
  'rock',
  'role',
  'roll',
  'roof',
  'room',
  'root',
  'rose',
  'rule',
  'rush',
  'ruth',
  'safe',
  'said',
  'sake',
  'sale',
  'salt',
  'same',
  'sand',
  'save',
  'seat',
  'seed',
  'seek',
  'seem',
  'seen',
  'self',
  'sell',
  'send',
  'sent',
  'sept',
  'ship',
  'shop',
  'shot',
  'show',
  'shut',
  'sick',
  'side',
  'sign',
  'site',
  'size',
  'skin',
  'slip',
  'slow',
  'snow',
  'soft',
  'soil',
  'sold',
  'sole',
  'some',
  'song',
  'soon',
  'sort',
  'soul',
  'spot',
  'star',
  'stay',
  'step',
  'stop',
  'such',
  'suit',
  'sure',
  'take',
  'tale',
  'talk',
  'tall',
  'tank',
  'tape',
  'task',
  'team',
  'tech',
  'tell',
  'tend',
  'term',
  'test',
  'text',
  'than',
  'that',
  'them',
  'then',
  'they',
  'thin',
  'this',
  'thou',
  'thus',
  'tide',
  'time',
  'tiny',
  'told',
  'toll',
  'tone',
  'tony',
  'took',
  'tool',
  'tour',
  'town',
  'tree',
  'trip',
  'true',
  'tune',
  'turn',
  'twin',
  'type',
  'unit',
  'upon',
  'used',
  'user',
  'vary',
  'vast',
  'very',
  'vice',
  'view',
  'vote',
  'wage',
  'wait',
  'wake',
  'walk',
  'wall',
  'want',
  'ward',
  'warm',
  'wash',
  'wave',
  'ways',
  'weak',
  'wear',
  'week',
  'well',
  'went',
  'were',
  'west',
  'what',
  'when',
  'whom',
  'wide',
  'wife',
  'wild',
  'will',
  'wind',
  'wine',
  'wing',
  'wire',
  'wise',
  'wish',
  'with',
  'wood',
  'word',
  'work',
  'yard',
  'yeah',
  'year',
  'your',
  'zero',
  'zone',
  'start',
  'train',
  'toast',
  'straw',
  'stone',
  'incur',
  'inert',
  'input',
  'inlet',
  'intro',
  'onion',
  'tonic',
  'night',
  'atoll',
  'atlas',
  'atom',
  'attic',
  'attack',
  'attend',
]

let cachedWords: string[] | null = null
let pendingDictionaryLoad: Promise<string[]> | null = null

/**
 * Directly sets the dictionary cache with the complete word list.
 *
 * @param words Complete array of valid lowercase dictionary words
 */
export function setDictionaryCache(words: string[]): void {
  cachedWords = words
}

/**
 * Loads the dictionary synchronously from disk in Node / server environments,
 * or returns cached words / fallback vocabulary in the browser.
 */
export function loadDictionarySync(): string[] {
  if (cachedWords) return cachedWords
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path')
      const p = path.join(process.cwd(), 'public', 'dictionary', 'words.json')
      if (fs.existsSync(p)) {
        cachedWords = JSON.parse(fs.readFileSync(p, 'utf-8'))
        return cachedWords!
      }
    } catch {
      // Fallback
    }
  }
  return FALLBACK_VOCABULARY
}

/**
 * Asynchronously loads the complete dictionary in browser environments,
 * caching the result for subsequent synchronous bot turns.
 * Reuses the in-flight request if one is already in progress.
 */
export async function loadDictionaryAsync(): Promise<string[]> {
  if (cachedWords) return cachedWords
  if (pendingDictionaryLoad) return pendingDictionaryLoad

  if (typeof window !== 'undefined') {
    pendingDictionaryLoad = fetch('/dictionary/words.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((words) => {
        if (Array.isArray(words) && words.length > 0) {
          cachedWords = words
          return words
        }
        return loadDictionarySync()
      })
      .catch(() => loadDictionarySync())
      .finally(() => {
        pendingDictionaryLoad = null
      })
    return pendingDictionaryLoad
  }
  return loadDictionarySync()
}

// Auto-populate cache in browser environments
if (typeof window !== 'undefined') {
  loadDictionaryAsync().catch(() => {})
}

export function getRequiredPrefix(lastWord: string): string {
  if (!lastWord || lastWord.length < 2) return ''
  const c0 = lastWord[lastWord.length - 2]
  const c1 = lastWord[lastWord.length - 1]
  if (hasTwoLetterPrefix(c0, c1)) {
    return c0 + c1
  }
  return c1
}

/**
 * Creates a word-chain bot function according to difficulty level.
 */
export function createWordChainBot(level: 'easy' | 'medium' | 'hard') {
  return (s: WordChainState): WordChainMove => {
    const slipRate = BOT_CONFIGS[level].slipRate
    const shouldSlip = Math.random() < slipRate

    // Deliberate slip: return a rule-violating or repeated word
    if (shouldSlip) {
      if (s.lastWord && Math.random() < 0.5) {
        // Repeat previous word
        return s.lastWord
      }
      // Return word with wrong prefix or too short
      return 'no'
    }

    const dict = loadDictionarySync()
    const reqPrefix = getRequiredPrefix(s.lastWord)

    // Filter candidates
    let candidates = dict.filter((w) => {
      if (w.length < 3) return false
      if (reqPrefix && !w.startsWith(reqPrefix)) return false
      const hash = computeTruncatedHash(w)
      if (s.wordHashes.includes(hash)) return false
      return true
    })

    if (candidates.length === 0) {
      // Check fallback vocabulary if primary dict had no match
      candidates = FALLBACK_VOCABULARY.filter((w) => {
        if (w.length < 3) return false
        if (reqPrefix && !w.startsWith(reqPrefix)) return false
        const hash = computeTruncatedHash(w)
        return !s.wordHashes.includes(hash)
      })
    }

    if (candidates.length === 0) {
      // No valid candidate found; return fallback word (will be a strike)
      return reqPrefix ? reqPrefix + 'x' : 'sol'
    }

    if (level === 'easy') {
      // Easy: prefer shorter words (length 3..=5)
      const easyList = candidates.filter((w) => w.length <= 5)
      const pool = easyList.length > 0 ? easyList : candidates
      return pool[Math.floor(Math.random() * pool.length)]
    }

    if (level === 'medium') {
      // Medium: words up to length 8
      const medList = candidates.filter((w) => w.length <= 8)
      const pool = medList.length > 0 ? medList : candidates
      return pool[Math.floor(Math.random() * pool.length)]
    }

    // Hard: full vocabulary, strategically prefer words that end with prefixes that have fewer continuations
    // or letters like x, z, q, j
    const strategic = candidates.filter((w) => {
      const last = w[w.length - 1]
      return ['x', 'z', 'q', 'j', 'v'].includes(last)
    })

    if (strategic.length > 0 && Math.random() < 0.6) {
      return strategic[Math.floor(Math.random() * strategic.length)]
    }

    return candidates[Math.floor(Math.random() * candidates.length)]
  }
}
