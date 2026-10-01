// Optional sound effects (Section 6.9, off by default): a soft two-note chime after a
// correct answer and one low note otherwise. Web Audio, no files.

let context: AudioContext | null = null

export function playAnswerSound(correct: boolean): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    context ??= new Ctor()
    const ctx = context
    const notes = correct ? [660, 880] : [330]
    notes.forEach((frequency, index) => {
      const start = ctx.currentTime + index * 0.09
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.06, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })
  } catch {
    // Audio is a nicety; never let it break an answer.
  }
}
