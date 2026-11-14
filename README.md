# 부동산 계산소 — 청약가점 · 주담대 DSR · 취득세 계산기

2026년 기준 한국 부동산 계산기를 한 페이지에 모은 정적 웹앱입니다.
빌드 도구·의존성 없이 `index.html` 하나로 동작하며, GitHub Pages에 그대로 배포할 수 있습니다.

- 라이브: https://sdn6517-cmd.github.io/budongsan-calc/
- 기준일: 2026-11-14

## 구성

```
index.html      계산기 3종 + 해설·체크리스트·FAQ (단일 진입점)
styles.css      모바일 우선 반응형 스타일 (Pretendard CDN)
app.js          계산 엔진 + UI (순수 함수는 window.BDS 로 노출)
privacy.html    개인정보처리방침 (쿠키·제3자 광고 고지)
about.html      서비스 소개·계산 기준·면책·문의
sitemap.xml     검색엔진용 사이트맵
robots.txt      크롤러 정책 (AdSense 크롤러 허용)
og-image.png    OpenGraph 공유 이미지 (1200×630)
tests/          계산 엔진 자동 검증 (QuickJS / 브라우저)
```

## 계산기

1. **청약가점 (84점)** — 무주택기간(32) · 부양가족(35) · 청약통장(17), 배우자 통장 50%·최대 3점 합산, 기산일 자동 계산
2. **주담대 DSR·한도** — 스트레스 금리(수도권 3.0%p / 지방 0.75%p), 원리금균등·원금균등, 기존 대출 반영, LTV·시가별 금액한도(6억·4억·2억) 반영
3. **취득세** — 취득세 + 지방교육세 + 농어촌특별세, 6억·9억 누진구간, 8%·12% 중과, 생애최초 감면(200만·300만 원)

## 로컬 실행

```bash
cd budongsan-calc
python3 -m http.server 8000
# http://localhost:8000/
```

## 계산 엔진 검증

```bash
pip install quickjs
python3 tests/run.py
# === 결과: PASS 81 / FAIL 0 (총 81) ===
```

브라우저에서 `tests/test.html` 을 열어도 같은 검증을 볼 수 있습니다.

## 광고 코드 넣는 곳

| 지면 | 위치 | id |
| --- | --- | --- |
| 상단 | 계산기 위 | `#ad-slot-top` |
| 본문 중간 | 계산기와 해설 사이 | `#ad-slot-infeed` |
| 하단 | 본문 끝 | `#ad-slot-bottom` |

1. **Google AdSense** — `index.html` 의 `</head>` 직전 주석에 있는 로더 스크립트를 풀고
   `ca-pub-XXXXXXXXXXXXXXXX` 을 실제 게시자 ID로 바꿉니다. 각 지면의 `.ad-inner` 안에
   `<ins class="adsbygoogle" ...></ins>` 와 `(adsbygoogle = window.adsbygoogle || []).push({});` 를 넣습니다.
2. **Taboola / MGID** — `</body>` 직전에 사업자 스크립트를 한 번 넣고, 각 지면의 `.ad-inner` 안에
   해당 위젯 컨테이너를 넣습니다.
3. 승인 전에는 지면이 점선 자리표시자로 보이며, 빈 광고 코드는 넣지 않습니다.

## 배포

```bash
gh repo create sdn6517-cmd/budongsan-calc --public --source=. --remote=origin --push
gh api -X POST repos/sdn6517-cmd/budongsan-calc/pages \
  -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

## 데이터·면책

계산은 모두 브라우저에서 실행되며 입력값은 서버로 전송되지 않습니다.
결과는 공개 법령·발표자료에 기반한 참고용 추정이며, 실제 세액·한도는 지자체 판단과 금융회사 심사에 따라 달라집니다.
