// Ported from my_lab/src/hooks/characterOpacity.ts. Keep the same stagger and fade.
export function createCharacterOpacityUpdater(
  count: number,
  write: (index: number, opacity: number) => void,
): (progress: number) => void {
  const dimOpacity = .12;
  const stagger = .06;
  const fadeDuration = 1;
  const duration = fadeDuration + Math.max(0, count - 1) * stagger;
  const values = new Float64Array(count).fill(dimOpacity);
  let previousTime = 0;
  return (progress) => {
    const time = Math.min(1, Math.max(0, progress)) * duration;
    const first = Math.max(0, Math.floor((Math.min(time, previousTime) - fadeDuration) / stagger));
    const last = Math.min(count - 1, Math.ceil(Math.max(time, previousTime) / stagger));
    for (let index = first; index <= last; index++) {
      const fade = Math.min(1, Math.max(0, (time - index * stagger) / fadeDuration));
      const opacity = Math.round((dimOpacity + (1 - dimOpacity) * fade) * 1000) / 1000;
      if (values[index] !== opacity) { values[index] = opacity; write(index, opacity); }
    }
    previousTime = time;
  };
}
