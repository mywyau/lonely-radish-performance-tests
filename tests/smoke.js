import { optionsFor } from '../helpers/config.js'
import { mixedReadJourney } from '../journeys/mixed-read.js'

export const options = optionsFor('smoke')

export default function () {
  mixedReadJourney()
}

