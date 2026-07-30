import { publicJourney } from './public.js'
import { discoveryJourney } from './discovery.js'
import { matchingJourney } from './matching.js'
import { planningJourney } from './planning.js'
import { accountJourney } from './account.js'
import { hasSessions } from '../helpers/sessions.js'

export function mixedReadJourney() {
  if (!hasSessions()) {
    publicJourney()
    return
  }

  const bucket = (__VU * 17 + __ITER * 7) % 100
  if (bucket < 20) publicJourney()
  else if (bucket < 60) discoveryJourney()
  else if (bucket < 80) matchingJourney()
  else if (bucket < 95) planningJourney()
  else accountJourney()
}
