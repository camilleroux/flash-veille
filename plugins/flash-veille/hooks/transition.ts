// L'effet au changement d'actu : le titre s'écrit de gauche à droite, comme à la
// machine à écrire, derrière un point discret, sur `frames` images.

const CURSOR = '·'

export function revealFrame(text: string, frame: number, frames: number): string {
  const chars = Array.from(text)
  if (frame >= frames) {
    return text
  }
  const shown = Math.floor((chars.length * frame) / frames)
  const cursor = shown < chars.length ? CURSOR : ''
  // Même longueur à chaque image : la ligne ne bouge pas pendant l'effet
  return chars.slice(0, shown).join('') + cursor + ' '.repeat(Math.max(0, chars.length - shown - cursor.length))
}
