/* 계산 엔진 자동 검증 (QuickJS · 브라우저 공용)
   실행: python3 tests/run.py  또는 브라우저에서 tests/test.html */
(function () {
  var log = (typeof console !== 'undefined' && console.log) ? console.log : print;
  var B = (typeof window !== 'undefined' ? window : globalThis).BDS;
  if (!B) {
    log('FAIL: BDS 를 찾을 수 없습니다. app.js 를 먼저 실행하세요.');
    return;
  }

  var pass = 0, fail = 0, failures = [];

  function r4(n) { return Math.round(n * 10000) / 10000; }

  function check(name, actual, expected, tol) {
    var ok;
    if (typeof expected === 'number' && typeof actual === 'number') {
      if (tol !== undefined) ok = Math.abs(actual - expected) <= Math.abs(expected) * tol;
      else ok = Math.abs(actual - expected) < 1e-6;
    } else {
      ok = actual === expected;
    }
    if (ok) pass++;
    else {
      fail++;
      failures.push(name + ' | 기대 ' + expected + ' / 실제 ' + actual);
    }
    return ok;
  }

  /* ---------------- 1. 청약가점 ---------------- */
  check('무주택 0개월 → 2점', B.homelessScore(0), 2);
  check('무주택 11개월 → 2점', B.homelessScore(11), 2);
  check('무주택 12개월 → 4점', B.homelessScore(12), 4);
  check('무주택 84개월(7년) → 16점', B.homelessScore(84), 16);
  check('무주택 180개월 → 32점', B.homelessScore(180), 32);
  check('무주택 240개월 → 32점 상한', B.homelessScore(240), 32);

  check('부양가족 0명 → 5점', B.dependentScore(0), 5);
  check('부양가족 2명 → 15점', B.dependentScore(2), 15);
  check('부양가족 6명 → 35점', B.dependentScore(6), 35);
  check('부양가족 9명 → 35점 상한', B.dependentScore(9), 35);

  check('통장 5개월 → 1점', B.accountScore(5), 1);
  check('통장 6개월 → 2점', B.accountScore(6), 2);
  check('통장 11개월 → 2점', B.accountScore(11), 2);
  check('통장 12개월 → 3점', B.accountScore(12), 3);
  check('통장 60개월(5년) → 7점', B.accountScore(60), 7);
  check('통장 180개월 → 17점', B.accountScore(180), 17);
  check('통장 300개월 → 17점 상한', B.accountScore(300), 17);

  check('배우자 통장 0 → 0점', B.spousePoints(0), 0);
  check('배우자 통장 12개월(→6개월) → 2점', B.spousePoints(12), 2);
  check('배우자 통장 72개월(→3년) → 3점 상한', B.spousePoints(72), 3);

  var c1 = B.calcCheongyak({ ownMonths: 84, dependents: 2, accountMonths: 60 });
  check('합산 7년·2명·5년 → 무주택 16', c1.ownPts, 16);
  check('합산 7년·2명·5년 → 부양 15', c1.depPts, 15);
  check('합산 7년·2명·5년 → 통장 7', c1.accPts, 7);
  check('합산 7년·2명·5년 → 총 38점', c1.total, 38);

  var c2 = B.calcCheongyak({ ownMonths: 180, dependents: 6, accountMonths: 180 });
  check('만점 조합 → 84점', c2.total, 84);

  var c3 = B.calcCheongyak({ ownMonths: 156, dependents: 0, accountMonths: 156, spouseMonths: 72 });
  check('통장 15점 + 배우자 3점 → 17점 상한', c3.accPts, 17);
  check('통장 상한 적용 총점 28+5+17 = 50', c3.total, 50);

  var c4 = B.calcCheongyak({ ownMonths: 120, dependents: 1, accountMonths: 24, ownsHome: true });
  check('유주택 → 무주택 0점', c4.ownPts, 0);

  var h1 = B.homelessStart({ birth: '1994-02-05', today: '2026-11-14' });
  check('만 30세 도달 후 33개월', h1.months, 33);
  var h2 = B.homelessStart({ birth: '1994-02-05', marriage: '2020-05-10', today: '2026-11-14' });
  check('30세 이전 혼인 → 혼인신고일 기산 78개월', h2.months, 78);
  var h3 = B.homelessStart({ birth: '2000-01-01', today: '2026-11-14' });
  check('만 30세 미만 미혼 → 0개월', h3.months, 0);

  /* ---------------- 2. DSR ---------------- */
  check('1원당 연 원리금(4%, 30년, 원리금균등) ≈ 0.05729',
    B.yearlyServicePerWon(4, 360, 'annuity'), 0.057290, 0.001);
  check('1원당 1년차 원리금(5%, 30년, 원금균등) ≈ 0.082569',
    B.yearlyServicePerWon(5, 360, 'equalPrincipal'), 0.082569, 0.001);
  check('원금균등 1년차(1억, 5%, 30년) ≈ 8,256,944',
    B.equalPrincipalFirstYear(1e8, 5, 360), 8256944, 0.001);

  // 금융위원회 발표 예시(2025.5): 소득 5,000만·금리 4.2%·30년 원리금균등·스트레스 1.5%p → 약 2억 8,700만
  var d1 = B.calcDsr({ income: 50000000, rate: 4.2, years: 30, method: 'annuity',
    stress: 1.5, limitPct: 40, desired: 300000000 });
  check('DSR한도(소득5천·4.2%·1.5%p) ≈ 2억 8,700만',
    Math.round(d1.dsrLimit / 1e6) * 1e6, 287000000, 0.01);

  // 금융위원회 10·15 대책 예시: 소득 5,000만·금리 4.0%·30년·변동형 3.0%p → 약 2억 5,100만
  var d2 = B.calcDsr({ income: 50000000, rate: 4.0, years: 30, method: 'annuity',
    stress: 3.0, limitPct: 40, desired: 300000000 });
  check('DSR한도(소득5천·4.0%·3.0%p) ≈ 2억 5,100만',
    Math.round(d2.dsrLimit / 1e6) * 1e6, 251000000, 0.01);
  check('스트레스 3.0%p가 1.5%p보다 한도 작음', d2.dsrLimit < d1.dsrLimit, true);

  var d3 = B.calcDsr({ income: 60000000, rate: 4.5, years: 30, method: 'annuity',
    stress: 3.0, limitPct: 40, desired: 300000000 });
  check('DSR 산정금리 7.5%', r4(d3.checkedRate), 7.5, 1e-9);
  check('DSR 3억·소득6천 → 약 41.9%', Math.round(d3.dsrStressed * 10) / 10, 41.9, 0.02);
  check('DSR 3억·소득6천 → 한도 초과', d3.withinLimit, false);
  check('월 상환액(실제 4.5%, 3억) ≈ 1,520,060', Math.round(d3.monthlyActual), 1519726, 0.01);
  check('총 이자(실제 기준) > 0', d3.totalInterest > 0, true);
  check('원금균등이 원리금균등보다 총이자 적음',
    B.calcDsr({ income: 60000000, rate: 4.5, years: 30, method: 'equalPrincipal', stress: 0, limitPct: 40, desired: 300000000 }).totalInterest
      < d3.totalInterest, true);

  var d4 = B.calcDsr({ income: 80000000, rate: 4.5, years: 30, method: 'annuity', stress: 3.0,
    limitPct: 40, desired: 300000000, housePrice: 900000000, area: 'metro' });
  check('시가 9억·LTV 40% → 최종한도 3.6억', d4.finalLimit, 360000000);
  check('규제 한도 항목 2개(LTV·금액한도)', d4.caps.length, 2);

  var d5 = B.calcDsr({ income: 200000000, rate: 4.0, years: 40, method: 'annuity', stress: 3.0,
    limitPct: 40, desired: 600000000, housePrice: 2000000000, area: 'metro' });
  check('시가 20억 → 금액한도 4억 적용', d5.finalLimit, 400000000);

  var d6 = B.calcDsr({ income: 50000000, rate: 5, years: 30, method: 'annuity', stress: 0.75,
    limitPct: 40, desired: 0, existingAnnual: 6000000 });
  check('기존 대출 있으면 한도 감소', d6.dsrLimit < d1.dsrLimit, true);

  var d7 = B.calcDsr({ income: 0, rate: 4, years: 30, method: 'annuity', stress: 0, limitPct: 40, desired: 100000000 });
  check('소득 0 → DSR 0%(0 나눗셈 방지)', d7.dsrStressed, 0);

  /* ---------------- 3. 취득세 ---------------- */
  var a1 = B.calcAcqTax({ price: 600000000, houses: 1, over85: false });
  check('6억·1주택 → 세율 1%', a1.rate, 0.01);
  check('6억·1주택 → 취득세 600만', a1.acq, 6000000);
  check('6억·1주택 85㎡이하 → 지방교육세 60만', a1.edu, 600000);
  check('6억·1주택 85㎡이하 → 농특세 0', a1.farm, 0);
  check('6억·1주택 85㎡이하 → 합계 660만', a1.total, 6600000);

  var a2 = B.calcAcqTax({ price: 900000000, houses: 1, over85: true });
  check('9억 → 세율 3%', a2.rate, 0.03);
  check('9억 85㎡초과 → 농특세 180만', a2.farm, 1800000);
  check('9억 85㎡초과 → 합계 3,150만', a2.total, 31500000);

  var a3 = B.calcAcqTax({ price: 750000000, houses: 1, over85: true });
  check('7.5억 → 누진 2%', a3.rate, 0.02);
  check('7.5억 85㎡초과 → 합계 1,800만', a3.total, 18000000);

  var a4 = B.calcAcqTax({ price: 800000000, houses: 2, adjusted: true, over85: true });
  check('조정 2주택 → 8%', a4.rate, 0.08);
  check('조정 2주택 → 지방교육세 0.4%(320만)', a4.edu, 3200000);
  check('조정 2주택 8억 85㎡초과 → 합계 7,200만', a4.total, 72000000);

  var a5 = B.calcAcqTax({ price: 1200000000, houses: 3, adjusted: true, over85: true });
  check('조정 3주택 → 12%', a5.rate, 0.12);
  check('조정 3주택 12억 85㎡초과 → 합계 1억 6,080만', a5.total, 160800000);

  var a6 = B.calcAcqTax({ price: 700000000, houses: 2, adjusted: false, over85: false });
  check('조정 외 2주택 → 일반세율 1.67%(소수 넷째자리 반올림)', a6.rate, 0.0167);
  check('조정 외 3주택 → 8%', B.calcAcqTax({ price: 700000000, houses: 3, adjusted: false }).rate, 0.08);
  check('조정 외 4주택 → 12%', B.calcAcqTax({ price: 700000000, houses: 4, adjusted: false }).rate, 0.12);

  var a7 = B.calcAcqTax({ price: 500000000, houses: 1, firstHome: 'general' });
  check('생애최초 일반 5억 → 감면 200만', a7.relief, 2000000);
  check('생애최초 일반 5억 → 취득세 300만', a7.acq, 3000000);
  check('생애최초 일반 5억 → 지방교육세 포함 총 350만', a7.total, 3500000);

  var a8 = B.calcAcqTax({ price: 300000000, houses: 1, firstHome: 'small' });
  check('생애최초 소형 3억 → 감면 300만', a8.relief, 3000000);
  check('생애최초 소형 3억 → 취득세 0', a8.acq, 0);
  check('생애최초 소형 3억 → 지방교육세 30만', a8.total, 300000);

  var a9 = B.calcAcqTax({ price: 1300000000, houses: 1, firstHome: 'general' });
  check('12억 초과 → 감면 불가', a9.relief, 0);
  check('12억 초과 1주택 → 3%', a9.rate, 0.03);

  var a10 = B.calcAcqTax({ price: 600000000, houses: 1, firstHome: 'general', over85: true });
  check('생애최초 + 85㎡초과 → 농특세는 감면 전 기준 120만', a10.farm, 1200000);
  check('생애최초 + 85㎡초과 → 총 580만', a10.total, 5800000);

  var a11 = B.calcAcqTax({ price: 0, houses: 1 });
  check('취득가액 0 → 세액 0', a11.total, 0);

  /* ---------------- 4. 표기 ---------------- */
  check('표기 6억 5,000만원', B.koreanWon(650000000), '6억 5,000만원');
  check('표기 1억 2,000만원', B.koreanWon(120000000), '1억 2,000만원');
  check('표기 5,000만원', B.koreanWon(50000000), '5,000만원');
  check('표기 만원 단위 1,520만원', B.koreanWon(15200000), '1,520만원');

  log('');
  log('=== 결과: PASS ' + pass + ' / FAIL ' + fail + ' (총 ' + (pass + fail) + ') ===');
  if (fail) {
    failures.forEach(function (f) { log('  ✗ ' + f); });
  } else {
    log('  모든 검증 통과');
  }
})();
