import { optionsFor } from '../helpers/config.js'
import { mixedReadJourney } from '../journeys/mixed-read.js'

export const options = optionsFor('local250')

export default function () {
  mixedReadJourney()
}

