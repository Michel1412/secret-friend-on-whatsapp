export class DrawError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DrawError'
  }
}

export type AssignmentIds = {
  giverId: string
  receiverId: string
}

/**
 * Fisher–Yates. `rng` must return a number in [0, 1).
 */
function shuffledIndexes(length: number, rng: () => number): number[] {
  const perm = Array.from({ length }, (_, index) => index)
  for (let index = length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.max(0, Math.floor(rng() * (index + 1))))
    const current = perm[index]
    perm[index] = perm[swap] as number
    perm[swap] = current as number
  }
  return perm
}

export function isDerangement(indexes: readonly number[]): boolean {
  return indexes.every((value, index) => value !== index)
}

/** Rotation by one seat. Always a derangement for n ≥ 2. */
export function rotateDerangement(length: number): number[] {
  return Array.from({ length }, (_, index) => (index + 1) % length)
}

/**
 * A bijection with no fixed points.
 * Rejection sampling retries until one appears. For n ≥ 2 a derangement
 * always exists; a rotation is the fallback if the rng is pathological.
 * n = 1 is impossible.
 */
export function randomDerangement(
  length: number,
  rng: () => number = Math.random,
  maxAttempts = 1000,
): number[] {
  if (!Number.isInteger(length) || length < 2) {
    throw new DrawError('É preciso pelo menos 2 pessoas para sortear.')
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const perm = shuffledIndexes(length, rng)
    if (isDerangement(perm)) return perm
  }
  return rotateDerangement(length)
}

export function drawDerangement<T extends { id: string }>(
  people: readonly T[],
  rng: () => number = Math.random,
): AssignmentIds[] {
  if (people.length < 2) {
    throw new DrawError('É preciso pelo menos 2 pessoas para sortear.')
  }
  const ids = new Set<string>()
  for (const person of people) {
    if (!person.id) throw new DrawError('Cada pessoa precisa de um identificador.')
    if (ids.has(person.id)) throw new DrawError('Há identificadores repetidos na lista.')
    ids.add(person.id)
  }
  const perm = randomDerangement(people.length, rng)
  return perm.map((receiverIndex, giverIndex) => ({
    giverId: people[giverIndex]!.id,
    receiverId: people[receiverIndex]!.id,
  }))
}
