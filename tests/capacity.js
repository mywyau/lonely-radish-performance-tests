import { arrivalRateOptions } from '../helpers/config.js'
import { capacityRequest } from '../journeys/capacity.js'

export const options = arrivalRateOptions()

export default function () {
  capacityRequest()
}

