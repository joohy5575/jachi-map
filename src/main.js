import { BUILDINGS as SAMPLE_BUILDINGS, CAMPUS, MAP_CENTER } from './sampleData.js'
import { createMap } from './map.js'
import { DESTINATIONS } from './destinations.js'
import { travelTimes, routeLine, slopeOf } from './routing.js'

const PYEONG = 3.3058 // 1평 = 3.3058㎡

// 처음에는 예시 데이터로 시작하고, public/deals.json(실제 실거래가)이 있으면 그걸로 바꾼다.
let BUILDINGS = SAMPLE_BUILDINGS
let dataLabel = '예시 데이터 · 실제 실거래가 아님'

async function loadRealDeals() {
  try {
    const res = await fetch('/deals.json')
    const data = await res.json() // 파일이 없으면 여기서 오류가 나서 예시 데이터를 그대로 쓴다.
    if (!data.buildings?.length) return
    BUILDINGS = data.buildings
    dataLabel = `국토교통부 실거래가 · ${data.generatedAt} 기준 · 최근 12개월`
  } catch {
    // 실제 데이터 파일이 아직 없음
  }
}

// 편의시설(편의점·빨래방 등). public/amenities.json 이 있으면 읽는다. (npm run fetch-amenities 로 만든다)
let AMENITIES = { categories: [], places: [] }
const AMENITY_ICONS = { convenience: '🏪', laundromat: '🧺', laundry: '👔', mart: '🛒', pharmacy: '💊' }
const NEARBY_METERS = 300 // 건물 "주변"으로 보는 직선거리

async function loadAmenities() {
  try {
    const data = await (await fetch('/amenities.json')).json()
    if (data.places?.length) AMENITIES = data
  } catch {
    // 편의시설 파일이 아직 없음
  }
}

// LH 임대공고. public/lh-notices.json 이 있으면 목록 위에 따로 보여 준다. (npm run fetch-lh 로 만든다)
async function loadLhNotices() {
  try {
    const data = await (await fetch('/lh-notices.json')).json()
    if (!Array.isArray(data.notices)) return
    const openCount = data.notices.filter((n) => n.open).length
    $('lh-summary').textContent =
      `🏢 LH 임대공고 · 서울 모집 중 ${openCount}건 · 최근 마감 ${data.notices.length - openCount}건 (${data.generatedAt} 기준)`
    $('lh-list').replaceChildren(
      ...data.notices.map((n) => {
        const li = document.createElement('li')
        if (!n.open) li.className = 'closed'
        const link = document.createElement('a')
        link.href = n.url
        link.target = '_blank'
        link.rel = 'noopener'
        link.textContent = n.name
        const meta = document.createElement('span')
        meta.className = 'meta'
        meta.textContent = [n.kind, n.region, n.status, n.closes && `마감 ${n.closes}`].filter(Boolean).join(' · ')
        li.append(link, meta)
        return li
      }),
    )
    $('lh-box').hidden = false
  } catch {
    // LH 공고 파일이 아직 없음 → 상자를 숨긴 채로 둔다.
  }
}

// 직방·다방·네이버부동산에는 공개 API 가 없어서 매물을 가져올 수 없다. 대신 그 사이트를 새 창으로 여는 링크를 건다.
// - 다방: 좌표를 넣으면 그 위치로 열리는 것을 확인했다.
// - 네이버부동산: 좌표를 넣는 형식으로 알고 있으나 직접 열어 확인하지는 못했다.
// - 직방: 좌표를 넣어도 무시된다. 원룸 지도만 열리므로 열린 뒤 주소를 검색해야 한다.
function listingLinks(b) {
  const links = [
    ['다방에서 이 주변 매물', `https://www.dabangapp.com/map/onetwo?m_lat=${b.lat}&m_lng=${b.lng}&m_zoom=17`],
    ['네이버부동산에서 이 주변 매물', `https://new.land.naver.com/rooms?ms=${b.lat},${b.lng},18&a=APT:OPST:ABYG:OBYG:GM:OR:VL&e=RETAIL`],
    ['직방 원룸 지도 (주소 검색 필요)', 'https://www.zigbang.com/home/oneroom/map'],
  ]
  return fold(
    'listing',
    '지금 나온 매물 찾아보기 <small>새 창으로 열림</small>',
    `<div class="listing-links">
      ${links.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`).join('')}
    </div>
    <p class="hint">이 지도의 가격은 이미 끝난 계약 기록입니다. 지금 계약할 수 있는 방은 위 사이트에서 확인하세요.</p>`,
  )
}

// 건물 → 편의시설 도보거리. public/amenity-walk.json 이 있으면 읽는다. (npm run fetch-amenity-walk 로 만든다)
let AMENITY_WALK = { withinSec: 300, buildings: {} }

async function loadAmenityWalk() {
  try {
    const data = await (await fetch('/amenity-walk.json')).json()
    if (data.buildings) AMENITY_WALK = data
  } catch {
    // 미리 계산한 파일이 아직 없음 → 직선거리로 대신한다.
  }
}

// 건물 → 주요 목적지 소요시간. public/travel-times.json 이 있으면 읽는다. (npm run fetch-travel-times 로 만든다)
let TRAVEL = { destinations: [], times: {} }

async function loadTravelTimes() {
  try {
    const data = await (await fetch('/travel-times.json')).json()
    if (data.times) TRAVEL = data
  } catch {
    // 미리 계산한 파일이 아직 없음 → 건물을 누를 때 경로 서버에 직접 물어본다.
  }
}

// 두 지점 사이의 직선거리(m)
function metersBetween(a, b) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371000
}

const state = {
  amenityCats: new Set(), // 지도에 켜 둔 편의시설 분류
  depositMax: 5000, // 만원
  rentMax: 100, // 만원
  type: '전체',
  kind: '전체', // 계약 종류: '전체' | '월세' | '전세'
  areaMax: 0, // 전용면적 최대(㎡). 0 이면 제한 없음
  commuteMax: 0, // 통학 목적지까지 도보 최대(분). 0 이면 제한 없음
  sort: 'recent', // 'recent'(최근 계약순) | 'rent'(월세 낮은순) | 'commute'(통학시간 짧은순)
  selectedId: null,
  // 상세 패널의 각 구역을 펼쳐 둘지 (제목을 누르면 접히고, 다른 건물을 눌러도 그 상태가 유지된다)
  open: { listing: true, travel: true, nearby: true, deals: true },
  // 고른 목적지. 필터의 "통학 목적지"와 같은 값이며, 건물을 바꿔도 유지해서 여러 방을 같은 목적지로 비교한다.
  destId: null,
  mode: 'walk', // 지도에 그릴 경로: 'walk'(도보) | 'bike'(자전거)
  custom: null, // 지도에서 직접 찍은 목적지 { id: 'custom', name, lat, lng }
}

const $ = (id) => document.getElementById(id)
const listView = $('list-view')
const detailView = $('detail-view')

// ---------- 표시용 글자 만들기 ----------

// 만원 단위 숫자를 "1억 2,000" 같은 글자로
function money(manwon) {
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000)
    const rest = manwon % 10000
    return rest ? `${eok}억 ${rest.toLocaleString()}` : `${eok}억`
  }
  return manwon.toLocaleString()
}

function priceText(deal) {
  return deal.rent === 0 ? `전세 ${money(deal.deposit)}` : `${money(deal.deposit)} / ${deal.rent}`
}

// 실거래가 자료에서 지하층은 음수(-1)로 온다.
function floorText(deal) {
  return deal.floor < 0 ? `지하 ${-deal.floor}층` : `${deal.floor}층`
}

function areaText(deal) {
  return `${deal.area}㎡ (${(deal.area / PYEONG).toFixed(1)}평)`
}

// 접었다 펼 수 있는 구역 하나를 만든다. key 는 state.open 의 이름, title 은 제목 안에 들어갈 HTML.
function fold(key, title, body) {
  return `
    <details class="fold" data-fold="${key}" ${state.open[key] ? 'open' : ''}>
      <summary><h3>${title}</h3></summary>
      ${body}
    </details>`
}

// ---------- 필터 ----------

// 슬라이더를 오른쪽 끝까지 밀면 "제한 없음"으로 본다. (그래야 보증금이 큰 전세도 보인다)
const DEPOSIT_LIMIT = 5000
const RENT_LIMIT = 100

function dealMatches(deal) {
  const depositOk = state.depositMax >= DEPOSIT_LIMIT || deal.deposit <= state.depositMax
  const rentOk = state.rentMax >= RENT_LIMIT || deal.rent <= state.rentMax
  const kindOk = state.kind === '전체' || (state.kind === '전세') === (deal.rent === 0)
  const areaOk = !state.areaMax || deal.area <= state.areaMax
  return depositOk && rentOk && kindOk && areaOk
}

function matchingDeals(building) {
  return building.deals.filter(dealMatches)
}

// 건물에서 목적지까지 걸어서 몇 초인지 (미리 계산한 파일에서 찾는다. 없으면 null)
function walkSeconds(b, destId) {
  const col = TRAVEL.destinations.indexOf(destId)
  return col >= 0 ? (TRAVEL.times[b.id]?.walk?.[col]?.[0] ?? null) : null
}

// 필터에서 고른 통학 목적지 (지도에서 직접 찍은 지점은 미리 계산한 시간이 없어서 제외)
function commuteDestination() {
  return DESTINATIONS.find((d) => d.id === state.destId) ?? null
}

// 조건에 맞는 건물을 고른 정렬 순서대로 돌려준다.
function visibleBuildings() {
  const dest = commuteDestination()
  const rows = BUILDINGS.filter(
    (b) => (state.type === '전체' || b.type === state.type) && matchingDeals(b).length > 0,
  )
    .map((b) => ({ b, deal: mainDeal(b), walk: dest ? walkSeconds(b, dest.id) : null }))
    .filter((row) => !dest || !state.commuteMax || (row.walk !== null && row.walk <= state.commuteMax * 60))

  const byRecent = (x, y) => y.deal.date.localeCompare(x.deal.date)
  // 전세(월세 0)는 월세 비교에서 맨 뒤로 보낸다.
  const rentOf = (row) => (row.deal.rent === 0 ? Infinity : row.deal.rent)
  const sorters = {
    recent: byRecent,
    rent: (x, y) => rentOf(x) - rentOf(y) || byRecent(x, y),
    commute: (x, y) => (x.walk ?? Infinity) - (y.walk ?? Infinity) || byRecent(x, y),
  }
  return rows.sort(sorters[state.sort]).map((row) => row.b)
}

// 가장 최근 거래 (날짜 글자가 YYYY-MM-DD 라서 글자 비교로 정렬 가능)
function latestDeal(deals) {
  return [...deals].sort((a, b) => b.date.localeCompare(a.date))[0]
}

// 목록과 가격표에 대표로 보여 줄 거래: 보통은 가장 최근 거래, "월세 낮은순"일 때는 가장 싼 월세 거래
function mainDeal(b) {
  const deals = matchingDeals(b)
  if (state.sort === 'rent') {
    const monthly = deals.filter((d) => d.rent > 0).sort((x, y) => x.rent - y.rent || x.deposit - y.deposit)
    if (monthly.length) return monthly[0]
  }
  return latestDeal(deals)
}

// ---------- 화면 그리기 ----------

let map = null

function renderMarkers(buildings) {
  if (!map) return
  map.setMarkers(
    buildings.map((b) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'price-marker' + (b.id === state.selectedId ? ' selected' : '')
      el.textContent = priceText(mainDeal(b))
      el.title = b.name
      el.addEventListener('click', () => selectBuilding(b.id))
      return { id: b.id, lat: b.lat, lng: b.lng, el }
    }),
  )
  requestAnimationFrame(declutter)
}

// 가격표가 서로 겹치면 읽을 수 없으므로, 겹치는 것은 작은 점으로 줄인다.
// 선택한 건물 → 최근 계약 순으로 자리를 먼저 차지하고, 지도를 확대하면 점이 다시 가격표로 펼쳐진다.
function declutter() {
  const mapRect = $('map').getBoundingClientRect()
  const els = [...document.querySelectorAll('.price-marker')]
  els.forEach((el) => el.classList.remove('dot'))
  els.sort((a, b) => b.classList.contains('selected') - a.classList.contains('selected'))
  const rects = els.map((el) => el.getBoundingClientRect())
  const GAP = 4
  const kept = []
  els.forEach((el, i) => {
    const r = rects[i]
    const inView =
      r.right > mapRect.left && r.left < mapRect.right && r.bottom > mapRect.top && r.top < mapRect.bottom
    const clash = kept.some(
      (k) => r.left < k.right + GAP && r.right > k.left - GAP && r.top < k.bottom + GAP && r.bottom > k.top - GAP,
    )
    const isDot = !(inView && !clash)
    if (isDot) el.classList.add('dot')
    else kept.push(r)
    // 지도가 마커를 감싸는 상자의 쌓임 순서를 정해, 가격표가 항상 점보다 위에 오게 한다.
    if (el.parentElement) {
      el.parentElement.style.zIndex = el.classList.contains('selected') ? 3 : isDot ? 1 : 2
    }
  })
}

function renderList(buildings) {
  $('count').textContent = `조건에 맞는 건물 ${buildings.length}곳`
  const list = $('building-list')
  const dest = commuteDestination()
  list.replaceChildren(
    ...buildings.map((b) => {
      const deal = mainDeal(b)
      const walk = dest ? walkSeconds(b, dest.id) : null
      const commute = walk === null ? '' : `<span class="commute">🚶 ${dest.name}까지 도보 ${minutesText({ sec: walk })}</span>`
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'building-item'
      btn.innerHTML = `
        <span class="tag">${b.type}</span>
        <span class="name">${b.name}</span>
        <span class="price">${priceText(deal)}</span>
        ${commute}
        <span class="meta">${b.dong} ·${b.buildYear ? `${b.buildYear}년` : '연도 미상'} · ${floorText(deal)} · ${areaText(deal)}</span>
        <span class="meta">계약 ${deal.date} · 거래 ${b.deals.length}건</span>`
      btn.addEventListener('click', () => selectBuilding(b.id))
      li.appendChild(btn)
      return li
    }),
  )
  if (buildings.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = '조건에 맞는 건물이 없습니다. 예산이나 통학 시간 조건을 조금 풀어 보세요.'
    list.appendChild(li)
  }
}

// ---------- 도보·자전거 소요시간 ----------

const MODE_NAMES = { walk: '도보', bike: '자전거' }
const timesCache = new Map() // 건물별 소요시간 표. 값: 결과 배열 | null(계산 중) | 'error'
const routeCache = new Map() // 건물+목적지+이동수단별 경로선

const routeKey = (b, dest, mode) => `${b.id}|${dest.lat},${dest.lng}|${mode}`

function allDestinations() {
  return state.custom ? [...DESTINATIONS, state.custom] : DESTINATIONS
}

function minutesText(t) {
  return `${Math.max(1, Math.round(t.sec / 60))}분`
}

function distanceText(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`
}

// 이 건물에서 모든 목적지까지의 시간을 이동수단별로 돌려준다.
// 아직 없으면 계산을 시작하고, 도보·자전거 중 먼저 끝난 것부터 화면을 다시 그린다.
// 돌려주는 값: { walk, bike } — 각각 결과 배열 | null(계산 중) | 'error'
function timesFor(b) {
  const key = b.id
  if (timesCache.has(key)) return timesCache.get(key)

  // 1) 미리 계산해 둔 파일에 있으면 그걸 쓴다. (서버에 묻지 않으므로 바로 뜬다)
  const saved = TRAVEL.times[b.id]
  if (saved?.walk && saved?.bike) {
    const pick = (list) =>
      DESTINATIONS.map((d) => {
        const [sec, m] = list[TRAVEL.destinations.indexOf(d.id)] ?? []
        return sec == null ? null : { sec, m }
      })
    const entry = { walk: pick(saved.walk), bike: pick(saved.bike) }
    if ([...entry.walk, ...entry.bike].every(Boolean)) {
      timesCache.set(key, entry)
      return entry
    }
  }

  // 2) 파일에 없는 건물(예시 데이터 등)은 경로 서버에 직접 물어본다.
  const entry = { walk: null, bike: null }
  timesCache.set(key, entry)
  for (const mode of Object.keys(MODE_NAMES)) {
    travelTimes(b, DESTINATIONS, mode)
      .then((result) => (entry[mode] = result))
      .catch((err) => {
        console.error(err)
        entry[mode] = 'error'
      })
      .finally(() => {
        if (state.selectedId === b.id) render()
      })
  }
  return entry
}

// 고른 목적지까지의 경로 요약: 시간·거리와 오르막·내리막 높이
function routeSummary(b) {
  const dest = allDestinations().find((d) => d.id === state.destId)
  const route = dest && routeCache.get(routeKey(b, dest, state.mode))
  if (!route) return ''
  const slope =
    route.up === undefined
      ? '오르막·내리막 계산 중…'
      : `<span class="up">↗ 오르막 ${route.up}m</span> · <span class="down">↘ 내리막 ${route.down}m</span><br>
         지도 경로선: <span class="up">빨강</span> 오르막, <span class="down">파랑</span> 내리막, 회색 평지`
  return `
    <p class="route-summary">
      <b>${dest.name}</b>까지 ${MODE_NAMES[state.mode]} ${minutesText(route)} · ${distanceText(route.m)}<br>
      ${slope}
    </p>`
}

function renderTravel(b) {
  const times = timesFor(b)
  const failed = times.walk === 'error' || times.bike === 'error'
  const cell = (list, i) => {
    if (list === 'error') return '–'
    if (!list) return '…'
    return `${minutesText(list[i])} <small>${distanceText(list[i].m)}</small>`
  }
  // 직접 찍은 목적지(편의시설 포함)는 경로를 그릴 때 받은 시간을 쓴다. 아직 안 받은 이동수단은 비워 둔다.
  const customCell = (mode) => {
    const route = routeCache.get(routeKey(b, state.custom, mode))
    if (route) return `${minutesText(route)} <small>${distanceText(route.m)}</small>`
    return mode === state.mode ? '…' : ''
  }
  const rows = allDestinations()
    .map((dest, i) => {
      const isCustom = dest.id === 'custom'
      return `
      <tr class="dest-row ${dest.id === state.destId ? 'on' : ''}" data-dest="${dest.id}">
        <td>${dest.name}</td>
        <td>${isCustom ? customCell('walk') : cell(times.walk, i)}</td>
        <td>${isCustom ? customCell('bike') : cell(times.bike, i)}</td>
      </tr>`
    })
    .join('')
  const modeChips = Object.entries(MODE_NAMES)
    .map(([mode, name]) => `<button type="button" data-mode="${mode}" class="${mode === state.mode ? 'on' : ''}">${name} 경로</button>`)
    .join('')

  // 접어도 고른 경로 요약은 계속 보이도록, 요약은 접히는 구역 밖에 둔다.
  return `
    ${fold(
      'travel',
      '주요 목적지까지 <small>예상 소요시간</small>',
      `<div class="chips mode-chips">${modeChips}</div>
      <table class="deals dests">
        <thead><tr><th>목적지</th><th>도보</th><th>자전거</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
    )}
    ${routeSummary(b)}
    <p class="hint" ${state.open.travel ? '' : 'hidden'}>${
      failed
        ? '일부 소요시간을 계산하지 못했습니다(– 표시). 건물을 다시 누르면 재시도합니다.'
        : '목적지를 누르면 지도에 경로가 그려집니다. 지도의 빈 곳을 눌러 목적지를 직접 찍을 수도 있습니다. 시간은 OpenStreetMap 길 자료로 계산한 예상값이라 언덕과 신호 대기는 반영되지 않습니다.'
    }</p>`
}

// ---------- 편의시설 ----------

// 편의시설 하나를 목적지로 삼는다. (건물을 고른 상태에서만 의미가 있다)
function chooseAmenity(place) {
  state.custom = { id: 'custom', name: place.name, lat: place.lat, lng: place.lng }
  state.destId = 'custom'
  state.amenityCats.add(place.cat)
  render()
}

function renderAmenityBar() {
  $('amenity-bar').replaceChildren(
    ...AMENITIES.categories.map((cat) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.textContent = `${AMENITY_ICONS[cat.id] || '📍'} ${cat.name}`
      chip.className = state.amenityCats.has(cat.id) ? 'on' : ''
      chip.addEventListener('click', () => {
        if (state.amenityCats.has(cat.id)) state.amenityCats.delete(cat.id)
        else state.amenityCats.add(cat.id)
        render()
      })
      return chip
    }),
  )
}

function renderAmenityMarkers() {
  if (!map) return
  map.setAmenities(
    AMENITIES.places
      .filter((p) => state.amenityCats.has(p.cat))
      .map((p) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'amenity-marker'
        el.textContent = AMENITY_ICONS[p.cat] || '📍'
        el.title = p.name
        // 건물을 고른 상태에서 누르면 그 편의시설까지의 경로를 보여 준다.
        el.addEventListener('click', () => {
          if (state.selectedId) chooseAmenity(p)
        })
        return { lat: p.lat, lng: p.lng, el }
      }),
  )
}

// 상세 패널: 분류별로 주변에 몇 곳 있는지와 가장 가까운 곳
let nearestByCat = {} // 표의 줄을 눌렀을 때 쓸 "분류별 가장 가까운 곳"
function renderNearby(b) {
  if (!AMENITIES.places.length) return ''
  nearestByCat = {}
  // 미리 계산한 도보거리가 있으면 그걸 쓰고, 없으면(예시 데이터 등) 직선거리로 대신한다.
  const walk = AMENITY_WALK.buildings[b.id]
  const rows = AMENITIES.categories
    .map((cat) => {
      let count, place, nearText
      const saved = walk?.[cat.id]
      if (saved?.near) {
        const [placeId, sec, m] = saved.near
        place = AMENITIES.places.find((p) => p.cat === cat.id && p.id === placeId)
        count = saved.n
        nearText = `도보 ${minutesText({ sec })} · ${distanceText(m)}`
      }
      if (!place) {
        const places = AMENITIES.places
          .filter((p) => p.cat === cat.id)
          .map((p) => ({ p, m: metersBetween(b, p) }))
          .sort((x, y) => x.m - y.m)
        if (!places.length) return ''
        place = places[0].p
        count = places.filter((x) => x.m <= NEARBY_METERS).length
        nearText = `직선 ${distanceText(places[0].m)}`
      }
      nearestByCat[cat.id] = place
      return `
      <tr class="amenity-row" data-cat="${cat.id}">
        <td>${AMENITY_ICONS[cat.id] || '📍'} ${cat.name}</td>
        <td>${count}곳</td>
        <td>${place.name} <small>${nearText}</small></td>
      </tr>`
    })
    .join('')
  return fold(
    'nearby',
    `주변 편의시설 <small>${walk ? `걸어서 ${Math.round(AMENITY_WALK.withinSec / 60)}분 안` : `직선거리 ${NEARBY_METERS}m 안`}</small>`,
    `<table class="deals dests">
      <thead><tr><th>종류</th><th>개수</th><th>가장 가까운 곳</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">줄을 누르면 가장 가까운 곳까지의 경로가 그려지고, 위 소요시간 표 맨 아래에 시간이 나옵니다.</p>`,
  )
}

// 목적지 핀: 건물을 고른 동안에는 목적지들을, 아니면 학교 위치 하나만 보여 준다.
function renderPins(selected) {
  if (!map) return
  const items = selected ? allDestinations() : [{ ...CAMPUS, id: null }]
  map.setPins(
    items.map((dest) => {
      const el = document.createElement('button')
      el.type = 'button'
      // 목적지가 많아서 평소에는 작은 점으로 두고, 고른 것만 이름표로 보여 준다. (학교 위치 하나만 보일 때는 항상 이름표)
      el.className = 'dest-pin' + (selected ? '' : ' always') + (selected && dest.id === state.destId ? ' on' : '')
      el.title = dest.name
      el.textContent = dest.name
      if (selected) el.addEventListener('click', () => chooseDestination(dest.id))
      return { lat: dest.lat, lng: dest.lng, el }
    }),
  )
}

function chooseDestination(id) {
  state.destId = id
  render()
}

// 고른 건물 → 고른 목적지 경로선을 지도에 그린다. 둘 중 하나라도 없으면 지운다.
let routeRequest = 0
async function updateRoute(selected) {
  if (!map) return
  const request = ++routeRequest
  const dest = allDestinations().find((d) => d.id === state.destId)
  if (!selected || !dest) return map.clearRoute()
  const key = routeKey(selected, dest, state.mode)
  try {
    if (!routeCache.has(key)) {
      const route = await routeLine(selected, dest, state.mode)
      routeCache.set(key, route)
      // 오르막·내리막은 따로 받아서, 도착하면 경로에 붙이고 다시 그린다. 실패해도 경로선은 한 색으로 그대로 보인다.
      slopeOf(route.path, route.m)
        .then((slope) => Object.assign(route, slope))
        .catch((err) => console.error(err))
        .finally(() => {
          if (state.selectedId === selected.id) render()
        })
      // 방금 받은 시간을 표에도 보여 주려고 다시 그린다. (이번에는 저장된 경로를 쓰므로 반복되지 않는다)
      if (request === routeRequest) render()
      return
    }
    const route = routeCache.get(key)
    // 그 사이 다른 걸 골랐으면 그리지 않는다. 경사 정보가 있으면 색을 나눠 그리고, 없으면 한 색으로 그린다.
    if (request === routeRequest) map.drawRoute(route.parts ?? [{ path: route.path }])
  } catch (err) {
    console.error(err)
    if (request === routeRequest) map.clearRoute()
  }
}

function renderDetail(b) {
  const rows = [...b.deals]
    .sort((x, y) => y.floor - x.floor)
    .map(
      (d) => `
      <tr class="${dealMatches(d) ? '' : 'dim'}">
        <td>${floorText(d)}</td>
        <td>${areaText(d)}</td>
        <td class="price">${priceText(d)}</td>
        <td>${d.date}</td>
      </tr>`,
    )
    .join('')

  detailView.innerHTML = `
    <button type="button" id="back-btn" class="back">← 목록으로</button>
    <span class="tag">${b.type}</span>
    <h2>${b.name}</h2>
    <dl class="facts">
      <div><dt>주소</dt><dd>서울 동대문구 ${b.dong} ${b.jibun}</dd></div>
      <div><dt>건축연도</dt><dd>${b.buildYear ? `${b.buildYear}년 (${new Date().getFullYear() - b.buildYear}년차)` : '정보 없음'}</dd></div>
      <div><dt>거래 건수</dt><dd>${b.deals.length}건</dd></div>
    </dl>
    ${map?.showRoadview ? '<button type="button" id="roadview-btn" class="roadview-btn">📷 로드뷰 보기</button>' : ''}
    ${listingLinks(b)}
    ${renderTravel(b)}
    ${renderNearby(b)}
    ${fold(
      'deals',
      '층별 실거래가 <small>보증금 / 월세 (만원)</small>',
      `<table class="deals">
        <thead><tr><th>층</th><th>전용면적</th><th>가격</th><th>계약일</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="hint">흐리게 보이는 줄은 지금 설정한 조건을 넘는 거래입니다.</p>`,
    )}`
  $('back-btn').addEventListener('click', () => selectBuilding(null))
  detailView.querySelectorAll('.dest-row').forEach((row) => {
    row.addEventListener('click', () => chooseDestination(row.dataset.dest))
  })
  $('roadview-btn')?.addEventListener('click', () => openRoadview(b))
  // 구역을 접거나 펴면 기억해 두었다가, 다른 건물을 눌러도 같은 상태로 보여 준다.
  detailView.querySelectorAll('details[data-fold]').forEach((box) => {
    box.addEventListener('toggle', () => {
      if (state.open[box.dataset.fold] === box.open) return
      state.open[box.dataset.fold] = box.open
      render()
    })
  })
  detailView.querySelectorAll('.amenity-row').forEach((row) => {
    row.addEventListener('click', () => chooseAmenity(nearestByCat[row.dataset.cat]))
  })
  detailView.querySelectorAll('.mode-chips button').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.mode = chip.dataset.mode
      render()
    })
  })
}

function render() {
  const buildings = visibleBuildings()
  // 필터를 바꿔서 선택한 건물이 사라졌으면 선택을 푼다.
  if (state.selectedId && !buildings.some((b) => b.id === state.selectedId)) {
    state.selectedId = null
  }
  const selected = BUILDINGS.find((b) => b.id === state.selectedId)

  $('deposit-label').textContent =
    state.depositMax >= DEPOSIT_LIMIT ? '제한 없음' : `${money(state.depositMax)}만원`
  $('rent-label').textContent = state.rentMax >= RENT_LIMIT ? '제한 없음' : `${state.rentMax}만원`
  document.querySelectorAll('#type-chips button').forEach((chip) => {
    chip.classList.toggle('on', chip.dataset.type === state.type)
  })
  // 통학 목적지는 지도나 상세 패널에서도 바뀔 수 있으므로 선택 상자를 그 값에 맞춘다.
  $('commute-dest').value = commuteDestination()?.id ?? ''

  listView.hidden = Boolean(selected)
  detailView.hidden = !selected
  if (selected) renderDetail(selected)
  else renderList(buildings)
  renderMarkers(buildings)
  renderPins(selected)
  renderAmenityBar()
  renderAmenityMarkers()
  updateRoute(selected)
}

// ---------- 로드뷰 ----------

async function openRoadview(b) {
  $('roadview-wrap').hidden = false // 로드뷰는 보이는 상자에만 그려지므로 먼저 보이게 한다.
  $('roadview-title').textContent = `${b.name} 주변 로드뷰`
  $('roadview-msg').hidden = true
  $('roadview').replaceChildren()
  const found = await map.showRoadview($('roadview'), b.lat, b.lng)
  if (!found) {
    $('roadview-msg').textContent = '이 건물 50m 안에는 로드뷰 사진이 없습니다.'
    $('roadview-msg').hidden = false
  }
}

function closeRoadview() {
  $('roadview-wrap').hidden = true
  $('roadview').replaceChildren()
}

function selectBuilding(id) {
  closeRoadview()
  state.selectedId = id
  // 지난번에 계산이 실패한 건물은 기록을 지워서, 다시 누르면 재시도하게 한다.
  for (const [key, entry] of timesCache) {
    if (entry.walk === 'error' || entry.bike === 'error') timesCache.delete(key)
  }
  const b = BUILDINGS.find((x) => x.id === id)
  if (b && map) map.panTo(b.lat, b.lng)
  render()
}

// ---------- 시작 ----------

function setupFilters() {
  $('deposit-max').addEventListener('input', (e) => {
    state.depositMax = Number(e.target.value)
    render()
  })
  $('rent-max').addEventListener('input', (e) => {
    state.rentMax = Number(e.target.value)
    render()
  })
  // 선택 상자들: 값이 바뀌면 상태에 옮겨 적고 다시 그린다.
  const bindSelect = (id, apply) =>
    $(id).addEventListener('change', (e) => {
      apply(e.target.value)
      render()
    })
  bindSelect('kind', (v) => (state.kind = v))
  bindSelect('area-max', (v) => (state.areaMax = Number(v)))
  bindSelect('commute-max', (v) => (state.commuteMax = Number(v)))
  bindSelect('sort', (v) => (state.sort = v))
  bindSelect('commute-dest', (v) => (state.destId = v || null))
  $('commute-dest').replaceChildren(
    new Option('선택 안 함', ''),
    ...DESTINATIONS.map((d) => new Option(d.name, d.id)),
  )

  // 유형 버튼은 데이터에 실제로 들어 있는 유형만 만든다.
  const types = ['전체', ...new Set(BUILDINGS.map((b) => b.type))]
  $('type-chips').replaceChildren(
    ...types.map((type) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.dataset.type = type
      chip.textContent = type
      chip.addEventListener('click', () => {
        state.type = type
        render()
      })
      return chip
    }),
  )
}

async function start() {
  $('roadview-close').addEventListener('click', closeRoadview)
  loadLhNotices()
  await Promise.all([loadRealDeals(), loadAmenities(), loadTravelTimes(), loadAmenityWalk()])
  setupFilters()
  render() // 지도가 뜨기 전에도 목록은 먼저 보여 준다.
  try {
    map = await createMap($('map'), MAP_CENTER)
    map.onViewChange(declutter)
    // 건물을 고른 상태에서 지도의 빈 곳을 누르면 그 지점을 목적지로 삼는다.
    map.onMapClick((lat, lng) => {
      if (!state.selectedId) return
      state.custom = { id: 'custom', name: '지도에서 찍은 지점', lat, lng }
      state.destId = 'custom'
      render()
    })
    $('data-badge').textContent =
      map.provider === 'kakao' ? dataLabel : `${dataLabel} · 임시 지도(카카오맵 연결 안 됨)`
    render()
  } catch (err) {
    console.error(err)
    $('map').textContent = '지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'
  }
}

start()
