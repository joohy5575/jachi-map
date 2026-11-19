// LH(한국토지주택공사)의 서울 지역 임대주택 공고를 받아
// 화면이 읽는 파일(public/lh-notices.json)로 만드는 스크립트.
// 실행: npm run fetch-lh   (.env 에 DATA_GO_KR_KEY 가 있어야 함)
//
// 먼저 공공데이터포털에서 "한국토지주택공사_분양임대공고문 조회 서비스"를 활용신청해야 한다.
// 이 API 는 공고명·유형·지역·상태·상세 링크만 주고 주소나 좌표는 주지 않는다. 그래서 지도가 아니라 목록으로 보여 준다.

import { writeFile, mkdir } from 'node:fs/promises'

const DATA_KEY = process.env.DATA_GO_KR_KEY
const ENDPOINT = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1'
const REGION = '11' // 서울
// 공고유형코드. 06 = 임대주택 (공식 문서에 나온 값). 13 = 매입임대·전세임대로 알고 있으나 문서에서 확인하지 못해, 실패하면 건너뛴다.
const TYPES = ['06', '13']
const OPEN_WORDS = ['공고중', '접수중'] // 지금 신청할 수 있는 상태 ("정정공고중"도 '공고중'이 들어 있어 포함된다)

const dateText = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

// 응답의 정확한 모양에 기대지 않도록, 공고명(PAN_NM)이 들어 있는 항목을 어디에 있든 모두 찾아낸다.
function findNotices(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => findNotices(v, out))
  else if (value && typeof value === 'object') {
    if (typeof value.PAN_NM === 'string') out.push(value)
    else Object.values(value).forEach((v) => findNotices(v, out))
  }
  return out
}

async function fetchType(type) {
  const key = DATA_KEY.includes('%') ? DATA_KEY : encodeURIComponent(DATA_KEY)
  const from = new Date()
  from.setMonth(from.getMonth() - 6)
  const to = new Date()
  to.setMonth(to.getMonth() + 6)
  const url =
    `${ENDPOINT}?serviceKey=${key}&PG_SZ=200&PAGE=1&UPP_AIS_TP_CD=${type}&CNP_CD=${REGION}` +
    `&PAN_NT_ST_DT=${dateText(from)}&CLSG_DT=${dateText(to)}`
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) {
    const reason = text.match(/"returnAuthMsg"\s*:\s*"([^"]+)"/)?.[1] || text.slice(0, 200)
    throw new Error(`LH 공고 조회 실패 (HTTP ${res.status}): ${reason}`)
  }
  return findNotices(JSON.parse(text))
}

async function main() {
  if (!DATA_KEY) {
    console.error('키가 없습니다. .env 파일에 DATA_GO_KR_KEY 를 넣어 주세요.')
    process.exit(1)
  }

  const all = []
  for (const type of TYPES) {
    try {
      const items = await fetchType(type)
      console.log(`공고유형 ${type}: ${items.length}건`)
      all.push(...items)
    } catch (err) {
      if (type === TYPES[0]) throw err // 첫 유형부터 실패하면 키·신청 문제이므로 멈춘다.
      console.log(`공고유형 ${type}: 건너뜀 (${err.message})`)
    }
  }

  // 모집 중인 공고가 없을 때도 많아서, 최근 마감된 공고도 함께 담는다. (open 값으로 구분, 모집 중인 것을 앞에)
  const notices = all
    .map((n) => ({
      open: OPEN_WORDS.some((word) => String(n.PAN_SS || '').includes(word)),
      name: n.PAN_NM,
      kind: n.AIS_TP_CD_NM || n.UPP_AIS_TP_NM || '',
      region: n.CNP_CD_NM || '',
      status: n.PAN_SS,
      posted: n.PAN_NT_ST_DT || n.PAN_DT || '',
      closes: n.CLSG_DT || '',
      url: n.DTL_URL || '',
    }))
    .sort((a, b) => b.open - a.open || b.posted.localeCompare(a.posted))

  await mkdir(new URL('../public/', import.meta.url), { recursive: true })
  await writeFile(
    new URL('../public/lh-notices.json', import.meta.url),
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: 'LH 분양임대공고문 조회 서비스', notices }),
  )
  console.log(`완료: 공고 ${notices.length}건 (모집 중 ${notices.filter((n) => n.open).length}건) → public/lh-notices.json`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
