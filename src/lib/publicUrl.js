/**
 * The canonical address to put in front of the room.
 *
 * Deliberately NOT window.location.origin. The projector might be opened on
 * dcsots-open-spaces.fly.dev, on a LAN IP during a rehearsal, or on localhost --
 * and in each case the QR code and the "Join at" line would send three hundred
 * people somewhere that isn't the address on the slides.
 *
 * VITE_PUBLIC_URL pins it at build time. It falls back to the current origin so
 * local development and preview builds still produce a scannable code.
 */
const configured = import.meta.env.VITE_PUBLIC_URL

export const publicUrl = (configured || window.location.origin).replace(/\/+$/, '')

/** What to print for humans: no scheme, no trailing slash. */
export const publicHost = publicUrl.replace(/^https?:\/\//, '')
