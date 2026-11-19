// 경희대 주변 편의시설(편의점·빨래방·세탁소·마트·약국) 위치를 카카오 장소 검색으로 받아
// 지도가 읽는 파일(public/amenities.json)로 만드는 스크립트.
// 실행: npm run fetch-amenities   (.env 에 KAKAO_REST_KEY 가 있어야 함)
//
// 카카오 장소 검색은 한 번에 최대 45곳까지만 알려 주므로, 지역을 작은 칸으로 나눠 칸마다 검색한 뒤 합친다.

import { writeFile, mkdir } from 'node:fs/promises'

const KAKAO_KEY = process.env.KAKAO_REST_KEY

// 실거래가 건물들이 있는 범위(회기동·이문동·휘경동)를 살짝 넓힌 사각형
const AREA = { south: 37.582, north: 37.607, west: 127.046, east: 127.074 }
const GRID = 4 // 가로·세로를 각각 몇 칸으로 나눌지

// code 가 있으면 카카오 "카테고리 검색", keyword 가 있으면 "키워드 검색"을 쓴다.
const CATEGORIES = [
  { id: 'convenience', name: '편의점', code: 'CS2' },
  { id: 'laundromat', name: '빨래방', keyword: '빨래방' },
  { id: 'laundry', name: '세탁소', keyword: '세탁소' },
  { id: 'mart', name: '마트', code: 'MT1' },
  { id: 'pharmacy', name: '약국', code: 'PM9' },
]

const OUT_FILE = new URL('../public/amenities.json', import.meta.url)

async function searchCell(category, rect) {
  const places = []
  for (let page = 1; page <= 3; page++) {
    const base = category.code
      ? `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category.code}`
      : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(category.keyword)}`
    const res = await fetch(`${base}&rect=${rect}&page=${page}&size=15`, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    })
    if (!res.ok) throw new Error(`카카오 장소 검색 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    places.push(...data.documents)
    if (data.meta.is_end) return { places, cut: false }
  }
  return { places, cut: true } // 45곳을 넘겨서 일부가 잘렸을 수 있음
}

async function main() {
  if (!KAKAO_KEY) {
    console.error('키가 없습니다. .env 파일에 KAKAO_REST_KEY 를 넣어 주세요.')
    process.exit(1)
  }

  const latStep = (AREA.north - AREA.south) / GRID
  const lngStep = (AREA.east - AREA.west) / GRID
  const found = new Map() // 같은 장소가 여러 칸·여러 분류에서 나와도 한 번만 담는다.

  for (const category of CATEGORIES) {
    let count = 0
    let cutCells = 0
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const west = AREA.west + lngStep * col
        const south = AREA.south + latStep * row
        const rect = [west, south, west + lngStep, south + latStep].join(',')
        const { places, cut } = await searchCell(category, rect)
        if (cut) cutCells++
        for (const p of places) {
          const key = `${category.id}|${p.id}`
          if (found.has(key)) continue
          found.set(key, {
            id: p.id,
            cat: category.id,
            name: p.place_name,
            address: p.road_address_name || p.address_name,
            lat: Number(p.y),
            lng: Number(p.x),
          })
          count++
        }
      }
    }
    console.log(`${category.name}: ${count}곳${cutCells ? ` (칸 ${cutCells}개에서 45곳 초과로 일부 누락 가능)` : ''}`)
  }

  // "세탁소" 검색에는 셀프빨래방도 섞여 나온다. 빨래방으로 이미 담긴 곳은 세탁소에서 뺀다.
  for (const [key, place] of found) {
    if (place.cat === 'laundry' && found.has(`laundromat|${place.id}`)) found.delete(key)
  }

  await mkdir(new URL('../public/', import.meta.url), { recursive: true })
  await writeFile(
    OUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      source: '카카오 장소 검색',
      categories: CATEGORIES.map(({ id, name }) => ({ id, name })),
      places: [...found.values()],
    }),
  )
  console.log(`완료: 모두 ${found.size}곳 → public/amenities.json`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
