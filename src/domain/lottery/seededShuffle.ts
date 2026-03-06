// Mulberry32 PRNG — deterministic 32-bit generator
function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Convert string seed to 32-bit integer via simple hash
function hashSeed(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		const char = seed.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return hash;
}

// Fisher-Yates shuffle with seeded PRNG
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
	const arr = [...items];
	const rng = mulberry32(hashSeed(seed));
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const temp = arr[i] as T;
		arr[i] = arr[j] as T;
		arr[j] = temp;
	}
	return arr;
}
