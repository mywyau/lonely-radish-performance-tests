import { optionsFor } from '../helpers/config.js'
import { mixedReadJourney } from '../journeys/mixed-read.js'

export const options = optionsFor('local1000')

export default function () {
  mixedReadJourney()
}
