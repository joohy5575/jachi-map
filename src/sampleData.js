// ⚠️ 예시(가짜) 데이터입니다. 실제 건물·실거래가가 아닙니다.
// 화면과 기능을 먼저 만들기 위한 것으로, 나중에 국토교통부 전월세 실거래가 API 결과로 교체합니다.
// 필드 구성은 실거래가 API(연립다세대·오피스텔 전월세)에 맞춰 두었습니다.
//   deposit: 보증금(만원), rent: 월세(만원, 0이면 전세), area: 전용면적(㎡), floor: 층, date: 계약일

export const CAMPUS = { name: '경희대학교 서울캠퍼스', lat: 37.5966, lng: 127.0522 }
export const MAP_CENTER = { lat: 37.5935, lng: 127.0565 }

export const BUILDINGS = [
  {
    id: 'b01', name: '회기 스카이빌', type: '다세대', dong: '회기동', jibun: '00-1', buildYear: 2016,
    lat: 37.5921, lng: 127.0548,
    deals: [
      { floor: 2, area: 19.8, deposit: 1000, rent: 55, date: '2026-09-14' },
      { floor: 3, area: 23.1, deposit: 1000, rent: 60, date: '2026-08-02' },
      { floor: 4, area: 19.8, deposit: 500, rent: 62, date: '2026-06-21' },
    ],
  },
  {
    id: 'b02', name: '경희 원룸텔', type: '다가구', dong: '회기동', jibun: '00-2', buildYear: 2004,
    lat: 37.5936, lng: 127.0539,
    deals: [
      { floor: 1, area: 16.5, deposit: 300, rent: 40, date: '2026-10-05' },
      { floor: 2, area: 16.5, deposit: 500, rent: 38, date: '2026-07-18' },
    ],
  },
  {
    id: 'b03', name: '회기역 리버오피스텔', type: '오피스텔', dong: '회기동', jibun: '00-3', buildYear: 2019,
    lat: 37.5904, lng: 127.0569,
    deals: [
      { floor: 5, area: 24.6, deposit: 1000, rent: 75, date: '2026-10-22' },
      { floor: 8, area: 24.6, deposit: 2000, rent: 70, date: '2026-09-03' },
      { floor: 11, area: 29.7, deposit: 1000, rent: 85, date: '2026-08-11' },
      { floor: 12, area: 24.6, deposit: 18000, rent: 0, date: '2026-05-30' },
    ],
  },
  {
    id: 'b04', name: '청운 하우스', type: '다가구', dong: '회기동', jibun: '00-4', buildYear: 1998,
    lat: 37.5947, lng: 127.0561,
    deals: [
      { floor: 1, area: 14.9, deposit: 200, rent: 35, date: '2026-09-27' },
      { floor: 2, area: 18.2, deposit: 500, rent: 40, date: '2026-08-15' },
      { floor: 3, area: 18.2, deposit: 500, rent: 42, date: '2026-04-09' },
    ],
  },
  {
    id: 'b05', name: '이문 그린빌', type: '다세대', dong: '이문동', jibun: '00-5', buildYear: 2012,
    lat: 37.5972, lng: 127.0596,
    deals: [
      { floor: 2, area: 21.5, deposit: 1000, rent: 48, date: '2026-10-11' },
      { floor: 3, area: 26.4, deposit: 1500, rent: 50, date: '2026-07-07' },
    ],
  },
  {
    id: 'b06', name: '외대앞 센트럴오피스텔', type: '오피스텔', dong: '이문동', jibun: '00-6', buildYear: 2021,
    lat: 37.5958, lng: 127.0612,
    deals: [
      { floor: 4, area: 22.3, deposit: 1000, rent: 68, date: '2026-10-29' },
      { floor: 7, area: 22.3, deposit: 500, rent: 72, date: '2026-09-19' },
      { floor: 9, area: 27.9, deposit: 2000, rent: 78, date: '2026-06-02' },
    ],
  },
  {
    id: 'b07', name: '휘경 해오름빌', type: '다세대', dong: '휘경동', jibun: '00-7', buildYear: 2009,
    lat: 37.5893, lng: 127.0598,
    deals: [
      { floor: 1, area: 20.1, deposit: 500, rent: 43, date: '2026-08-25' },
      { floor: 3, area: 20.1, deposit: 1000, rent: 42, date: '2026-07-30' },
    ],
  },
  {
    id: 'b08', name: '회기 새롬주택', type: '다가구', dong: '회기동', jibun: '00-8', buildYear: 1994,
    lat: 37.5928, lng: 127.0583,
    deals: [
      { floor: 1, area: 13.2, deposit: 100, rent: 33, date: '2026-10-02' },
      { floor: 2, area: 15.8, deposit: 300, rent: 36, date: '2026-05-16' },
    ],
  },
  {
    id: 'b09', name: '캠퍼스뷰 원룸', type: '다세대', dong: '회기동', jibun: '00-9', buildYear: 2018,
    lat: 37.5951, lng: 127.0544,
    deals: [
      { floor: 2, area: 18.9, deposit: 1000, rent: 58, date: '2026-10-18' },
      { floor: 3, area: 18.9, deposit: 1000, rent: 60, date: '2026-09-09' },
      { floor: 5, area: 33.0, deposit: 3000, rent: 65, date: '2026-06-12' },
    ],
  },
  {
    id: 'b10', name: '이문 한솔빌라', type: '다세대', dong: '이문동', jibun: '00-10', buildYear: 2001,
    lat: 37.5984, lng: 127.0579,
    deals: [
      { floor: 2, area: 29.8, deposit: 2000, rent: 40, date: '2026-09-23' },
      { floor: 3, area: 29.8, deposit: 12000, rent: 0, date: '2026-03-28' },
    ],
  },
  {
    id: 'b11', name: '휘경 라온오피스텔', type: '오피스텔', dong: '휘경동', jibun: '00-11', buildYear: 2017,
    lat: 37.5886, lng: 127.0625,
    deals: [
      { floor: 3, area: 21.0, deposit: 1000, rent: 60, date: '2026-10-08' },
      { floor: 6, area: 21.0, deposit: 500, rent: 65, date: '2026-08-20' },
    ],
  },
  {
    id: 'b12', name: '회기 다솜하우스', type: '다가구', dong: '회기동', jibun: '00-12', buildYear: 2007,
    lat: 37.5912, lng: 127.0532,
    deals: [
      { floor: 2, area: 17.4, deposit: 500, rent: 45, date: '2026-09-30' },
      { floor: 3, area: 17.4, deposit: 500, rent: 47, date: '2026-07-24' },
      { floor: 4, area: 23.6, deposit: 1000, rent: 50, date: '2026-04-19' },
    ],
  },
]
