// Directional drag, motion blur and chromatic separation inspired by
// https://joseph-san.com/ Works. Written for this transparent title canvas.
export const titleFragment = /* glsl */ `
precision mediump float;
uniform sampler2D tDiffuse;
uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform vec2 uViewportScale;
uniform vec4 uTitleRect;
uniform float uRevealProgress;
uniform float uRevealGlyphCount;
varying vec2 vUv;

vec4 readTitle(vec2 uv) {
    // Transparent outside the title prevents stretched edge pixels.
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
        return vec4(0.0);
    }
    vec4 color = texture2D(tDiffuse, uv);
    if (uRevealGlyphCount > 0.0) {
        // Section PNGs use .95em advances and .4em of trailing space for
        // the accent dot. Use source coordinates so warped samples keep
        // their own glyph's reveal value, including chromatic trails.
        float titleX = (uv.x - uTitleRect.x) / uTitleRect.z;
        float labelCount = uRevealGlyphCount - 1.0;
        float glyph = clamp(floor(titleX * (labelCount * 0.95 + 0.4) / 0.95), 0.0, labelCount);
        float time = clamp(uRevealProgress, 0.0, 1.0) * (1.0 + labelCount * 0.06);
        float opacity = mix(0.12, 1.0, clamp(time - glyph * 0.06, 0.0, 1.0));
        // Both pigment and coverage are premultiplied; fading alpha alone
        // would leave bright rectangles or halos around the title.
        color *= opacity;
    }
    return color;
}

void main() {
    vec2 localVelocity = uVelocity / uViewportScale;
    vec2 wakeCenter = uMouse - localVelocity * 4.0;
    float distanceToWake = length((vUv - wakeCenter) * uViewportScale);
    float influence = 1.0 - smoothstep(0.0, 0.25, distanceToWake);

    if (length(uVelocity) < 0.0001 || influence < 0.001) {
        gl_FragColor = readTitle(vUv);
        return;
    }

    vec2 drag = localVelocity * influence;
    vec2 warped = vUv - drag * 1.5;
    vec3 pigment = vec3(0.0);
    vec3 coverage = vec3(0.0);
    const int taps = 10;
    for (int tap = 0; tap < taps; tap++) {
        float position = float(tap) / float(taps - 1) - 0.5;
        vec2 blurred = warped + drag * (position * 7.0);
        vec4 red = readTitle(blurred + drag * 5.0);
        vec4 green = readTitle(blurred);
        vec4 blue = readTitle(blurred - drag * 5.0);
        pigment += vec3(red.r, green.g, blue.b);
        coverage += vec3(red.a, green.a, blue.a);
    }
    pigment /= float(taps);
    coverage /= float(taps);
    // Keep separated channels visible over the existing atmosphere, with
    // premultiplied alpha matching the WebGL canvas and render target.
    float alpha = max(coverage.r, max(coverage.g, coverage.b));
    gl_FragColor = vec4(pigment, alpha);
}
`;

export const titleVertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Rasterize the supplied title into a transparent padded render target first.
// The second pass above then retains the original site's shader unchanged.
export const textureFragment = `
precision mediump float;
uniform sampler2D tDiffuse;
uniform vec4 uRect;
varying vec2 vUv;
void main() {
    vec2 uv = (vUv - uRect.xy) / uRect.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
        gl_FragColor = vec4(0.0);
    } else {
        gl_FragColor = texture2D(tDiffuse, uv);
    }
}
`;

