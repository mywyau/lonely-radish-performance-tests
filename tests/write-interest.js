import { writeInterestOptions } from '../helpers/config.js'
import { sendSyntheticInterest } from '../journeys/member-write.js'

export const options = writeInterestOptions()

export default function () {
  sendSyntheticInterest()
}

