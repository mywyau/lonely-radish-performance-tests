import { diagnosticOptionsFor } from '../helpers/config.js'
import { mixedReadJourney } from '../journeys/mixed-read.js'

export const options = diagnosticOptionsFor('diagnostic600')

export default function () {
  mixedReadJourney()
}
