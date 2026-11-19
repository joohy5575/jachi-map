// 모든 건물 → 주요 목적지까지의 도보·자전거 소요시간을 미리 계산해
// 지도가 읽는 파일(public/travel-times.json)로 만드는 스크립트.
// 실행: npm run fetch-travel-times   (키 필요 없음. public/deals.json 이 먼저 있어야 함)
//
// 화면에서 건물을 누를 때마다 경로 서버에 물어보면 "요청이 너무 잦다"고 거절당하므로,
// 여기서 한꺼번에 받아 둔다. 실거래가(deals.json)를 새로 받았으면 이것도 다시 실행한다.

import { readFile, writeFile } from 'node:fs/promises'
import { DESTINATIONS } from '../src/destinations.js'

const BASE = 'https://routing.openstreetmap.de'
const MODES = {
  walk: { server: 'routed-foot', profile: 'foot' },
  bike: { server: 'routed-bike', profile: 'bike' },
}
const BATCH = 60 // 한 번에 묶어 보내는 건물 수
const PAUSE_MS = 2000 // 공개 서버에 부담을 주지 않도록 요청 사이에 쉬는 시간

const DEALS_FILE = new URL('../public/deals.json', import.meta.url)
const OUT_FILE = new URL('../public/travel-times.json', import.meta.url)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const point = (p) => `${p.lng},${p.lat}`

async function table(mode, buildings) {
  const { server, profile } = MODES[mode]
  const coords = [...buildings, ...DESTINATIONS].map(point).join(';')
  const sources = buildings.map((_, i) => i).join(';')
  const destinations = DESTINATIONS.map((_, i) => buildings.length + i).join(';')
  const url =
    `${BASE}/${server}/table/v1/${profile}/${coords}` +
    `?sources=${sources}&destinations=${destinations}&annotations=duration,distance`

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.code !== 'Ok') throw new Error(data.message || `HTTP ${res.status}`)
      return data
    } catch (err) {
      if (attempt >= 5) throw new Error(`경로 계산 실패 (${mode}): ${err.message}`)
      await sleep(PAUSE_MS * attempt * 3) // 거절당하면 점점 더 오래 쉬었다가 다시 시도
    }
  }
}

async function main() {
  const { buildings } = JSON.parse(await readFile(DEALS_FILE, 'utf8'))
  const times = Object.fromEntries(buildings.map((b) => [b.id, {}]))

  for (const mode of Object.keys(MODES)) {
    for (let start = 0; start < buildings.length; start += BATCH) {
      const batch = buildings.slice(start, start + BATCH)
      const data = await table(mode, batch)
      batch.forEach((b, row) => {
        // 목적지 순서대로 [초, 미터] 를 담는다. (파일 크기를 줄이려고 반올림)
        times[b.id][mode] = DESTINATIONS.map((_, col) => [
          Math.round(data.durations[row][col]),
          Math.round(data.distances[row][col]),
        ])
      })
      console.log(`${mode}: ${Math.min(start + BATCH, buildings.length)} / ${buildings.length}`)
      await sleep(PAUSE_MS)
    }
  }

  await writeFile(
    OUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'OpenStreetMap 경로 계산 (routing.openstreetmap.de)',
      destinations: DESTINATIONS.map((d) => d.id),
      times,
    }),
  )
  console.log(`완료: 건물 ${buildings.length}곳 × 목적지 ${DESTINATIONS.length}곳 → public/travel-times.json`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
