import { statefulJourneyOptions } from '../helpers/config.js'
import { statefulMatchAndPlanJourney } from '../journeys/stateful-match-plan.js'

export const options = statefulJourneyOptions()

export default function () {
  statefulMatchAndPlanJourney()
}

