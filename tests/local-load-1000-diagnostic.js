import { diagnosticOptionsFor } from '../helpers/config.js'
import { mixedReadJourney } from '../journeys/mixed-read.js'

export const options = diagnosticOptionsFor('local1000')

export default function () {
  mixedReadJourney()
}
