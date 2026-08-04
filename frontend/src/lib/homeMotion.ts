export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function sceneIndexAt(progress: number, count: number) {
  if (count < 1) return 0;
  return Math.min(count - 1, Math.floor(clamp01(progress) * count));
}

export function sceneBlendAt(progress: number, count: number) {
  if (count < 1) {
    return { index: 0, nextIndex: 0, blend: 0 };
  }

  const scaled = clamp01(progress) * count;
  const index = Math.min(count - 1, Math.floor(scaled));

  return {
    index,
    nextIndex: Math.min(count - 1, index + 1),
    blend: index === count - 1 ? 0 : scaled - index,
  };
}
