/** Distribution and mobile constants ported from my_lab's Atmosphere. */
export function createAtmosphereModel(random = Math.random, count = 3000) {
  const positions = new Float32Array(count * 3);
  const timings = new Float32Array(count);
  const movements = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    let x: number, y: number, z: number;
    if (random() < .01) {
      const angle = random() * Math.PI * 2;
      const phi = random() * Math.PI * 2;
      const radius = random() * 3.6;
      x = radius * Math.sin(phi) * Math.cos(angle);
      y = radius * Math.sin(phi) * Math.sin(angle) * .3;
      z = radius * Math.cos(phi);
    } else {
      const twist = random() * .5;
      const radius = 3.6 + random() * 8.4;
      const angle = random() * Math.PI * 2 + radius * twist;
      const phi = (random() - .5) * Math.PI * .6;
      x = radius * Math.cos(angle) + (random() - .5) * radius * .4;
      y = radius * Math.sin(phi) + (random() - .5) * radius * .3;
      z = radius * Math.sin(angle) + (random() - .5) * radius * .4;
    }
    positions.set([x, y, z + random() * 100 - 50], i * 3);
    timings[i] = random() * Math.PI * 2;
    movements.set([.2 + random() * 1.8, .2 + random() * 1.8], i * 2);
  }
  return { positions, timings, movements };
}

export function atmosphereProjection(width: number, height: number) {
  const f = 1 / Math.tan(Math.PI / 8);
  const near = .1, far = 1000;
  return new Float32Array([
    f / (width / height), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, 2 * far * near / (near - far), 0,
  ]);
}

export const atmosphereView = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -15, 1,
]);

// THREE.Color reads hex colors as sRGB and stores linear RGB.
function linear(value: number) {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
}
export const atmosphereColor = [linear(175), linear(172), linear(172)] as const;

export function atmosphereUniforms(timeSeconds: number) {
  return { time: timeSeconds, fogTime: timeSeconds * .65, scrollOffset: timeSeconds * .03 };
}

/** The website's radial canvas texture, sampled at each texel center. */
export function createStarTexture(size = 32) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.sqrt(Math.pow((x + .5) / size * 2 - 1, 2) + Math.pow((y + .5) / size * 2 - 1, 2));
      const alpha = radius <= .2 ? 1 : radius <= .4 ? 1 - (radius - .2) * 3 : Math.max(0, .4 * (1 - radius) / .6);
      pixels.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return pixels;
}
