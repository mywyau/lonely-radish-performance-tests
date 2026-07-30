import { browserSmokeOptions } from '../helpers/config.js'
import { browserJourney } from '../journeys/browser.js'

export const options = browserSmokeOptions()

export default async function () {
  await browserJourney()
}

