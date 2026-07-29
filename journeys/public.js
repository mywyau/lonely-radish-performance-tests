import { sleep } from 'k6'
import { expectStatus, get } from '../helpers/http.js'

function think(min = 0.8, max = 2.5) {
  sleep(min + Math.random() * (max - min))
}

export function publicJourney() {
  expectStatus(get('/', 'public', 'homepage'), 'homepage')
  think()
  expectStatus(get('/faq', 'public', 'faq'), 'faq')
  think()
  expectStatus(get('/api/total-users-stats', 'public', 'user-stats'), 'user stats')
  think(1, 3)
}

