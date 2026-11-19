// 도보·자전거 소요시간과 경로를 계산하는 파일.
// 카카오는 도보·자전거 길찾기를 공개 API로 제공하지 않아서,
// OpenStreetMap 길 자료로 경로를 계산해 주는 공개 서버(routing.openstreetmap.de)를 쓴다. 키가 필요 없다.
// 주의: 언덕과 신호 대기는 반영되지 않는 "예상값"이다.

const BASE = 'https://routing.openstreetmap.de'
const MODES = {
  walk: { server: 'routed-foot', profile: 'foot' },
  bike: { server: 'routed-bike', profile: 'bike' },
}

const point = (p) => `${p.lng},${p.lat}`

// 공개 서버는 요청이 몰리면 거절(429)하고 한동안 막아 버린다.
// 그래서 요청을 한 줄로 세워, 앞 요청이 끝나고 1.2초가 지난 뒤에 다음 요청을 보낸다.
const GAP_MS = 1200
let queue = Promise.resolve()
function inTurn(task) {
  const result = queue.then(task)
  queue = result.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, GAP_MS)))
  return result
}

// 가끔 느리거나 실패하므로, 실패하면 한 번 더 시도한다.
async function getJson(url, retry = true) {
  try {
    return await inTurn(async () => {
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.code !== 'Ok') throw new Error(`경로 계산 실패: ${data.message || res.status}`)
      return data
    })
  } catch (err) {
    if (!retry) throw err
    return getJson(url, false)
  }
}

// 출발지 한 곳에서 여러 목적지까지의 시간(초)과 거리(m)를 한 번에 구한다. mode = 'walk' | 'bike'
// 돌려주는 값: 목적지 순서대로 [{ sec, m }, …]
export async function travelTimes(from, destinations, mode) {
  const { server, profile } = MODES[mode]
  const coords = [from, ...destinations].map(point).join(';')
  const data = await getJson(
    `${BASE}/${server}/table/v1/${profile}/${coords}?sources=0&annotations=duration,distance`,
  )
  return destinations.map((_, i) => ({ sec: data.durations[0][i + 1], m: data.distances[0][i + 1] }))
}

// ---------- 오르막·내리막 ----------
// 경로를 따라 일정 간격으로 점을 찍고, 각 점의 해발고도를 받아 와서 구간별 경사를 구한다.
// 고도 자료는 Open-Meteo 의 무료 고도 API(키 필요 없음)를 쓴다.
// 주의: 고도 자료의 격자가 수십 m 단위로 성겨서, 짧은 계단이나 급경사는 뭉개질 수 있다.

export const SLOPE_COLORS = { up: '#d9342b', down: '#2f6fde', flat: '#4b5563' }
const STEEP = 0.04 // 경사 4% 이상이면 오르막/내리막으로 본다.
const MAX_POINTS = 100 // 고도 API 가 한 번에 받는 점의 수

function metersBetween(a, b) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371000
}

// 경로선을 step(m) 간격의 점들로 다시 나눈다. 원래 꺾이는 점도 그대로 둔다.
function resample(path, step) {
  const points = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]
    const to = path[i]
    const pieces = Math.max(1, Math.ceil(metersBetween(from, to) / step))
    for (let k = 1; k <= pieces; k++) {
      points.push({
        lat: from.lat + ((to.lat - from.lat) * k) / pieces,
        lng: from.lng + ((to.lng - from.lng) * k) / pieces,
      })
    }
  }
  return points
}

// 경로에 경사 정보를 붙여 돌려준다.
// 돌려주는 값: { up: 오른 높이 합(m), down: 내려간 높이 합(m), parts: [{ path, color }] }
export async function slopeOf(path, totalMeters) {
  let step = Math.max(20, totalMeters / (MAX_POINTS - 1))
  let points = resample(path, step)
  while (points.length > MAX_POINTS) {
    step *= 1.3
    points = resample(path, step)
  }

  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${points.map((p) => p.lat.toFixed(6)).join(',')}` +
      `&longitude=${points.map((p) => p.lng.toFixed(6)).join(',')}`,
  )
  const data = await res.json()
  if (!res.ok || !Array.isArray(data.elevation)) throw new Error('고도 자료를 받지 못했습니다.')

  // 경로 시작점부터 각 점까지의 누적 거리
  const along = [0]
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + metersBetween(points[i - 1], points[i]))

  let up = 0
  let down = 0
  const parts = []
  const SPAN = 2 // 경사는 앞뒤 2점씩(약 80m)을 묶어 계산한다. 고도 값이 1m 단위 계단식이라 한 구간만 보면 들쭉날쭉하다.
  for (let i = 1; i < points.length; i++) {
    const rise = data.elevation[i] - data.elevation[i - 1]
    if (rise > 0) up += rise
    else down -= rise
    const a = Math.max(0, i - 1 - SPAN)
    const b = Math.min(points.length - 1, i + SPAN)
    const slope = (data.elevation[b] - data.elevation[a]) / Math.max(1, along[b] - along[a])
    const color = slope >= STEEP ? SLOPE_COLORS.up : slope <= -STEEP ? SLOPE_COLORS.down : SLOPE_COLORS.flat
    // 같은 색이 이어지면 한 선으로 합친다.
    const last = parts[parts.length - 1]
    if (last && last.color === color) last.path.push(points[i])
    else parts.push({ color, path: [points[i - 1], points[i]] })
  }
  return { up: Math.round(up), down: Math.round(down), parts }
}

// 출발지에서 목적지까지 실제 길을 따라가는 선(좌표 목록)을 구한다.
export async function routeLine(from, to, mode) {
  const { server, profile } = MODES[mode]
  const data = await getJson(
    `${BASE}/${server}/route/v1/${profile}/${point(from)};${point(to)}?overview=full&geometries=geojson`,
  )
  const route = data.routes[0]
  return {
    sec: route.duration,
    m: route.distance,
    path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  }
}
