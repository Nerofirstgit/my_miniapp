const mobileTitleAnimation = { sweepDurationSeconds: 3, repeatDelaySeconds: 5, curveAmplitude: 0.4 };

export type TitleBounds = { left: number; top: number; width: number; height: number };

/** Feed the existing hover shader a virtual pointer; never dispatch DOM events. */
export function createTitleSweep() {
    let startedAt: number | null = null;
    let initialDelaySeconds = 0;
    const duration = Math.max(1 / 60, mobileTitleAnimation.sweepDurationSeconds);
    const delay = Math.max(0, mobileTitleAnimation.repeatDelaySeconds);
    const start = (now: number, delaySeconds = initialDelaySeconds) => {
        if (startedAt === null) startedAt = now + delaySeconds * 1000;
    };

    return {
        start,
        reset(delaySeconds = 0) {
            startedAt = null;
            initialDelaySeconds = delaySeconds;
        },
        // Query without reading layout. Sleep only in the neutral interval;
        // late timers and lifecycle resumes still use the original epoch.
        nextDelay(now: number) {
            start(now);
            const elapsed = (now - startedAt!) / 1000;
            if (elapsed < 0) return -elapsed * 1000;
            const phase = elapsed % (duration + delay);
            return phase < duration ? 0 : (duration + delay - phase) * 1000;
        },
        update(now: number, title: TitleBounds, canvas: TitleBounds, viewportWidth: number, viewportHeight: number) {
            start(now);
            const elapsed = (now - startedAt!) / 1000;
            const phase = elapsed % (duration + delay);
            if (elapsed < 0 || phase >= duration || !canvas.width || !canvas.height) return null;

            const progress = phase / duration;
            const eased = progress * progress * (3 - 2 * progress);
            const cycle = Math.floor(elapsed / (duration + delay));
            const angle = progress * Math.PI * 2 + cycle * Math.PI / 3;
            const wave = Math.sin(progress * Math.PI);
            const envelope = wave * wave;
            const amplitude = title.height * Math.max(0, Math.min(0.5, mobileTitleAnimation.curveAmplitude));
            const offset = amplitude * Math.sin(angle) * envelope;
            // Differentiate the path so the shader's drag follows its curve,
            // including the gradual acceleration and deceleration in X.
            const slope = amplitude * (2 * Math.PI * Math.cos(angle) * envelope
                + 2 * Math.PI * Math.sin(angle) * wave * Math.cos(progress * Math.PI));
            const velocityX = title.width * 6 * progress * (1 - progress) / viewportWidth / (duration * 60);
            const velocityY = -slope / viewportHeight / (duration * 60);
            const speed = Math.hypot(velocityX, velocityY);
            const scale = speed > 0.018 ? 0.018 / speed : 1;

            return {
                x: (title.left - canvas.left + title.width * eased) / canvas.width,
                y: 1 - (title.top - canvas.top + title.height / 2 + offset) / canvas.height,
                // The shader's velocity uses viewport distance per 60 Hz frame.
                velocityX: velocityX * scale,
                velocityY: velocityY * scale,
            };
        },
    };
}

