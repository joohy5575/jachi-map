// 국토교통부 전월세 실거래가를 받아 와서 지도가 읽는 파일(public/deals.json)로 만드는 스크립트.
// 실행: npm run fetch-deals   (.env 에 DATA_GO_KR_KEY, KAKAO_REST_KEY 가 있어야 함)
//
// 하는 일
//   1) 동대문구의 최근 12개월 전월세 실거래가(연립다세대, 오피스텔)를 받아 온다.
//   2) 경희대 주변 동(회기동·이문동·휘경동)만 남기고, 같은 지번끼리 묶어 "건물"로 만든다.
//   3) 카카오 주소 검색으로 각 건물의 지도 좌표를 찾는다. (한 번 찾은 좌표는 저장해 두고 재사용)
//
// 참고: 단독·다가구 전월세는 층과 정확한 지번이 공개되지 않아 건물 단위로 표시할 수 없어 여기서는 뺐다.

import { readFile, writeFile, mkdir } from 'node:fs/promises'

const DATA_KEY = process.env.DATA_GO_KR_KEY
const KAKAO_KEY = process.env.KAKAO_REST_KEY

const LAWD_CD = '11230' // 서울 동대문구 (법정동 코드 앞 5자리)
const SIGUNGU = '서울 동대문구'
const DONGS = ['회기동', '이문동', '휘경동']
const MONTHS = 12

// 주택 유형별 API. nameField = 건물 이름이 들어 있는 항목.
const SOURCES = [
  { type: '다세대', service: 'RTMSDataSvcRHRent', nameField: 'mhouseNm' },
  { type: '오피스텔', service: 'RTMSDataSvcOffiRent', nameField: 'offiNm' },
]

const OUT_FILE = new URL('../public/deals.json', import.meta.url)
const CACHE_FILE = new URL('../data/geocode-cache.json', import.meta.url)

// ---------- 도구 ----------

// 최근 n개월을 'YYYYMM' 글자로 (이번 달부터 거꾸로)
function recentMonths(n) {
  const out = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

// 응답은 단순한 XML 이라서 <item>…</item> 안의 <이름>값</이름> 만 뽑아낸다.
function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const item = {}
    for (const [, key, value] of body.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) item[key] = value.trim()
    return item
  })
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]
const toNumber = (text) => Number(String(text ?? '').replace(/,/g, '')) || 0

// ---------- 1) 실거래가 받아 오기 ----------

async function fetchMonth(source, yyyymm) {
  // 포털에서 주는 키가 이미 인코딩된 형태(%가 들어 있음)면 그대로, 아니면 인코딩해서 쓴다.
  const key = DATA_KEY.includes('%') ? DATA_KEY : encodeURIComponent(DATA_KEY)
  const items = []
  for (let page = 1; ; page++) {
    const url =
      `https://apis.data.go.kr/1613000/${source.service}/get${source.service}` +
      `?serviceKey=${key}&LAWD_CD=${LAWD_CD}&DEAL_YMD=${yyyymm}&pageNo=${page}&numOfRows=1000`
    const res = await fetch(url)
    const xml = await res.text()
    const code = tag(xml, 'resultCode')
    if (!res.ok || !code || !/^0+$/.test(code)) {
      const reason = tag(xml, 'resultMsg') || tag(xml, 'returnAuthMsg') || xml.slice(0, 200)
      throw new Error(`${source.type} ${yyyymm} 조회 실패 (HTTP ${res.status}): ${reason}`)
    }
    items.push(...parseItems(xml))
    const total = toNumber(tag(xml, 'totalCount'))
    if (page * 1000 >= total) break
  }
  return items
}

// ---------- 2) 건물 단위로 묶기 ----------

function groupBuildings(rows) {
  const map = new Map()
  for (const { source, item } of rows) {
    if (!DONGS.includes(item.umdNm) || !item.jibun) continue
    const id = `${source.type}|${item.umdNm}|${item.jibun}`
    if (!map.has(id)) {
      map.set(id, {
        id,
        // 이름이 없는 건물은 API 가 "(103-150)" 처럼 지번만 괄호로 준다 → "회기동 103-150" 으로 바꾼다.
        name: (item[source.nameField] || '').replace(/^\(.*\)$/, '') || `${item.umdNm} ${item.jibun}`,
        type: source.type,
        dong: item.umdNm,
        jibun: item.jibun,
        buildYear: toNumber(item.buildYear) || null,
        deals: [],
      })
    }
    map.get(id).deals.push({
      floor: toNumber(item.floor),
      area: Math.round(toNumber(item.excluUseAr) * 10) / 10,
      deposit: toNumber(item.deposit),
      rent: toNumber(item.monthlyRent),
      date: [item.dealYear, item.dealMonth.padStart(2, '0'), item.dealDay.padStart(2, '0')].join('-'),
    })
  }
  return [...map.values()]
}

// ---------- 3) 주소 → 좌표 ----------

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function geocode(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } })
  if (!res.ok) throw new Error(`카카오 주소 검색 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`)
  const doc = (await res.json()).documents?.[0]
  return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null
}

// ---------- 실행 ----------

async function main() {
  if (!DATA_KEY || !KAKAO_KEY) {
    console.error('키가 없습니다. .env 파일에 DATA_GO_KR_KEY 와 KAKAO_REST_KEY 를 넣어 주세요. (.env.example 참고)')
    process.exit(1)
  }

  const rows = []
  for (const source of SOURCES) {
    for (const yyyymm of recentMonths(MONTHS)) {
      const items = await fetchMonth(source, yyyymm)
      console.log(`${source.type} ${yyyymm}: ${items.length}건`)
      rows.push(...items.map((item) => ({ source, item })))
    }
  }

  const buildings = groupBuildings(rows)
  console.log(`경희대 주변 건물 ${buildings.length}곳, 좌표를 찾는 중…`)

  const cache = await loadCache()
  const located = []
  let missing = 0
  for (const b of buildings) {
    const address = `${SIGUNGU} ${b.dong} ${b.jibun}`
    if (!(address in cache)) cache[address] = await geocode(address)
    if (cache[address]) located.push({ ...b, ...cache[address] })
    else missing++
  }

  await mkdir(new URL('../data/', import.meta.url), { recursive: true })
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 1))
  await mkdir(new URL('../public/', import.meta.url), { recursive: true })
  await writeFile(
    OUT_FILE,
    JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      source: '국토교통부 전월세 실거래가 (공공데이터포털)',
      buildings: located,
    }),
  )

  const dealCount = located.reduce((sum, b) => sum + b.deals.length, 0)
  console.log(`완료: 건물 ${located.length}곳, 거래 ${dealCount}건 → public/deals.json`)
  if (missing) console.log(`좌표를 찾지 못해 뺀 건물: ${missing}곳`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
