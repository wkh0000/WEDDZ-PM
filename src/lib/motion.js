// Reusable framer-motion presets. Spread into <motion.x {...preset} />.

export const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: 'easeOut' }
}

export const slideInRight = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: 24 },
  transition: { duration: 0.25, ease: 'easeOut' }
}

export const slideInLeft = {
  initial: { opacity: 0, x: -24 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: 'easeOut' }
}

export const slideInBottom = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 16 },
  transition: { duration: 0.25, ease: 'easeOut' }
}

export const pop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.96 },
  transition: { duration: 0.18, ease: 'easeOut' }
}

export const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } }
}

export const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: 'easeOut' }
}

export const overlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.15 }
}
