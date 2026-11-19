// 지도 담당 파일.
// 카카오 키(VITE_KAKAO_JS_KEY)가 있으면 카카오맵을, 없으면 OpenStreetMap(Leaflet) 임시 지도를 띄운다.
// 어느 쪽이든 main.js 에는 똑같은 기능 묶음을 돌려준다:
//   setMarkers(items)  : 가격표 마커를 새로 그림. items = [{ id, lat, lng, el }]
//   panTo(lat, lng)    : 지도 중심 이동
//   setPins(items)     : 목적지 핀을 새로 그림. items = [{ lat, lng, el }]
//   setAmenities(items): 편의시설 아이콘을 새로 그림. items = [{ lat, lng, el }]
//   drawRoute(parts)   : 경로선을 그림. parts = [{ path: [{ lat, lng }, …], color }]  / clearRoute() : 경로선 지움
//   onMapClick(callback)    : 지도의 빈 곳을 누르면 callback(lat, lng) 실행
//   onViewChange(callback)  : 지도를 움직이거나 확대·축소한 뒤에 callback 실행
//   showRoadview(container, lat, lng) : 로드뷰(거리 사진)를 띄움. 카카오맵에만 있는 기능 (임시 지도에는 없음)
//   provider           : 'kakao' | 'osm'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('스크립트를 불러오지 못했습니다: ' + src))
    document.head.appendChild(s)
  })
}

function loadCss(href) {
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = href
  document.head.appendChild(l)
}

const ROUTE_COLOR = '#e0457b'

async function createKakaoMap(container, center) {
  await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`)
  await new Promise((resolve) => window.kakao.maps.load(resolve))
  const { kakao } = window

  const map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(center.lat, center.lng),
    level: 4,
  })
  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT)

  let overlays = []
  let amenities = []
  let pins = []
  let route = [] // 경로선 조각들 (오르막·내리막 색이 달라서 여러 조각일 수 있다)
  function clearRoute() {
    route.forEach((line) => line.setMap(null))
    route = []
  }
  return {
    provider: 'kakao',
    setMarkers(items) {
      overlays.forEach((o) => o.setMap(null))
      overlays = items.map((item) => {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(item.lat, item.lng),
          content: item.el,
          yAnchor: 1,
          clickable: true,
        })
        overlay.setMap(map)
        return overlay
      })
    },
    panTo(lat, lng) {
      map.panTo(new kakao.maps.LatLng(lat, lng))
    },
    onViewChange(callback) {
      kakao.maps.event.addListener(map, 'idle', callback)
    },
    setPins(items) {
      pins.forEach((o) => o.setMap(null))
      pins = items.map((item) => {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(item.lat, item.lng),
          content: item.el,
          yAnchor: 1,
          clickable: true,
          zIndex: 4,
        })
        overlay.setMap(map)
        return overlay
      })
    },
    setAmenities(items) {
      amenities.forEach((o) => o.setMap(null))
      amenities = items.map((item) => {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(item.lat, item.lng),
          content: item.el,
          yAnchor: 1,
          clickable: true,
          zIndex: 0,
        })
        overlay.setMap(map)
        return overlay
      })
    },
    drawRoute(parts) {
      clearRoute()
      route = parts.map((part) => {
        const line = new kakao.maps.Polyline({
          path: part.path.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
          strokeWeight: 6,
          strokeColor: part.color || ROUTE_COLOR,
          strokeOpacity: 0.9,
        })
        line.setMap(map)
        return line
      })
    },
    clearRoute,
    onMapClick(callback) {
      kakao.maps.event.addListener(map, 'click', (e) => callback(e.latLng.getLat(), e.latLng.getLng()))
    },
    // 좌표 근처(50m 안)의 로드뷰를 container 에 띄운다. 근처에 로드뷰가 없으면 false 를 돌려준다.
    showRoadview(container, lat, lng) {
      const position = new kakao.maps.LatLng(lat, lng)
      return new Promise((resolve) => {
        new kakao.maps.RoadviewClient().getNearestPanoId(position, 50, (panoId) => {
          if (panoId === null) return resolve(false)
          container.replaceChildren()
          const roadview = new kakao.maps.Roadview(container)
          roadview.setPanoId(panoId, position)
          // 로드뷰가 준비되면 건물 위치에 마커를 세우고, 카메라가 그쪽을 보게 돌린다.
          kakao.maps.event.addListener(roadview, 'init', () => {
            const marker = new kakao.maps.Marker({ position, map: roadview })
            const viewpoint = roadview
              .getProjection()
              .viewpointFromCoords(marker.getPosition(), marker.getAltitude())
            roadview.setViewpoint(viewpoint)
          })
          resolve(true)
        })
      })
    },
  }
}

async function createOsmMap(container, center) {
  loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
  const L = window.L

  const map = L.map(container, { zoomControl: false }).setView([center.lat, center.lng], 16)
  L.control.zoom({ position: 'topright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  // 크기 0짜리 아이콘 안에 가격표를 넣고, CSS로 "가운데 아래"가 좌표에 오도록 맞춘다.
  const iconOf = (el) => L.divIcon({ html: el, className: 'osm-anchor', iconSize: [0, 0] })

  let markers = []
  let amenities = []
  let pins = []
  let route = []
  function clearRoute() {
    route.forEach((line) => line.remove())
    route = []
  }
  return {
    provider: 'osm',
    setMarkers(items) {
      markers.forEach((m) => m.remove())
      markers = items.map((item) =>
        L.marker([item.lat, item.lng], { icon: iconOf(item.el) }).addTo(map),
      )
    },
    panTo(lat, lng) {
      map.panTo([lat, lng])
    },
    onViewChange(callback) {
      map.on('moveend zoomend', callback)
    },
    setPins(items) {
      pins.forEach((m) => m.remove())
      pins = items.map((item) =>
        L.marker([item.lat, item.lng], { icon: iconOf(item.el), zIndexOffset: 1000 }).addTo(map),
      )
    },
    setAmenities(items) {
      amenities.forEach((m) => m.remove())
      amenities = items.map((item) =>
        L.marker([item.lat, item.lng], { icon: iconOf(item.el), zIndexOffset: -1000 }).addTo(map),
      )
    },
    drawRoute(parts) {
      clearRoute()
      route = parts.map((part) =>
        L.polyline(
          part.path.map((p) => [p.lat, p.lng]),
          { color: part.color || ROUTE_COLOR, weight: 6, opacity: 0.9 },
        ).addTo(map),
      )
    },
    clearRoute,
    onMapClick(callback) {
      map.on('click', (e) => callback(e.latlng.lat, e.latlng.lng))
    },
  }
}

export async function createMap(container, center) {
  if (KAKAO_KEY) {
    try {
      return await createKakaoMap(container, center)
    } catch (err) {
      console.error('카카오맵을 불러오지 못해 임시 지도로 대신합니다.', err)
    }
  }
  return createOsmMap(container, center)
}
