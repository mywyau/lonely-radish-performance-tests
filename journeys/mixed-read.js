import { memberReadJourney } from './member-read.js'
import { publicJourney } from './public.js'
import { hasSessions } from '../helpers/sessions.js'

export function mixedReadJourney() {
  // Reserve roughly one in five VUs for anonymous traffic when sessions exist.
  if (hasSessions() && __VU % 5 !== 0) memberReadJourney()
  else publicJourney()
}

