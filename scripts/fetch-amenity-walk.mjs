// 모든 건물 → 주변 편의시설까지의 "걸어서 가는 거리·시간"을 미리 계산해
// 지도가 읽는 파일(public/amenity-walk.json)로 만드는 스크립트.
// 실행: npm run fetch-amenity-walk   (키 필요 없음. deals.json 과 amenities.json 이 먼저 있어야 함)
//
// 직선거리는 골목·담장을 무시해서 실제보다 가깝게 나온다. 그래서 길을 따라 걷는 거리로 다시 계산한다.
// 저장하는 값: 건물마다, 편의시설 분류마다 { n: 도보 5분 안에 있는 곳 수, near: [가장 가까운 곳 id, 초, 미터] }

import { readFile, writeFile } from 'node:fs/promises'

const URL_BASE = 'https://routing.openstreetmap.de/routed-foot/table/v1/foot'
const BATCH = 20 // 한 번에 묶어 보내는 건물 수
const PLACE_CHUNK = 80 // 한 번에 묶어 보내는 편의시설 수
const PAUSE_MS = 2000 // 공개 서버에 부담을 주지 않도록 요청 사이에 쉬는 시간
const WITHIN_SEC = 300 // "주변"으로 보는 도보 시간 (5분)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const point = (p) => `${p.lng},${p.lat}`
const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))

async function table(buildings, places) {
  const coords = [...buildings, ...places].map(point).join(';')
  const sources = buildings.map((_, i) => i).join(';')
  const destinations = places.map((_, i) => buildings.length + i).join(';')
  const url = `${URL_BASE}/${coords}?sources=${sources}&destinations=${destinations}&annotations=duration,distance`
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.code !== 'Ok') throw new Error(data.message || data.code)
      return data
    } catch (err) {
      if (attempt >= 5) throw new Error(`도보거리 계산 실패: ${err.message}`)
      await sleep(PAUSE_MS * attempt * 3)
    }
  }
}

async function main() {
  const { buildings } = await readJson('../public/deals.json')
  const { places, categories } = await readJson('../public/amenities.json')
  const result = {}

  for (let start = 0; start < buildings.length; start += BATCH) {
    const batch = buildings.slice(start, start + BATCH)
    // 한 요청에 좌표를 너무 많이 담으면 서버가 거절하므로, 편의시설도 나눠서 보내고 결과를 이어 붙인다.
    const seconds = batch.map(() => [])
    const meters = batch.map(() => [])
    for (let from = 0; from < places.length; from += PLACE_CHUNK) {
      const data = await table(batch, places.slice(from, from + PLACE_CHUNK))
      batch.forEach((_, row) => {
        seconds[row].push(...data.durations[row])
        meters[row].push(...data.distances[row])
      })
      await sleep(PAUSE_MS)
    }
    batch.forEach((b, row) => {
      result[b.id] = {}
      for (const cat of categories) {
        let n = 0
        let near = null
        places.forEach((p, col) => {
          if (p.cat !== cat.id) return
          const sec = seconds[row][col]
          if (sec == null) return
          if (sec <= WITHIN_SEC) n++
          if (!near || sec < near[1]) near = [p.id, Math.round(sec), Math.round(meters[row][col])]
        })
        result[b.id][cat.id] = { n, near }
      }
    })
    console.log(`${Math.min(start + BATCH, buildings.length)} / ${buildings.length}`)
  }

  await writeFile(
    new URL('../public/amenity-walk.json', import.meta.url),
    JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'OpenStreetMap 경로 계산 (routing.openstreetmap.de)',
      withinSec: WITHIN_SEC,
      buildings: result,
    }),
  )
  console.log(`완료: 건물 ${buildings.length}곳 × 편의시설 ${places.length}곳 → public/amenity-walk.json`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
