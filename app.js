/*!
 * 부동산 계산소 — 청약가점 · 주담대 DSR · 취득세 계산기
 * 기준일: 2026-11-14 (대한민국)
 *
 * 모든 계산 함수는 DOM과 분리되어 있어 tests/test.html 에서 그대로 검증할 수 있습니다.
 * 근거 법령·발표자료는 about.html 의 '계산 기준'을 참고하세요.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. 공통 유틸
   * ------------------------------------------------------------------ */
  var EOK = 100000000;   // 1억
  var MAN = 10000;       // 1만
  var lastResults = {};  // 최근 계산 결과 (결과 복사 기능용)

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function toNum(value, fallback) {
    var f = (fallback === undefined) ? 0 : fallback;
    if (value === null || value === undefined || value === '') return f;
    var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : f;
  }

  /** 원 단위 숫자에 천 단위 쉼표 */
  function comma(n) {
    var v = Math.round(n);
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 원 → "6억 5,000만원" (읽기용) */
  function koreanWon(won) {
    var v = Math.round(won);
    if (v === 0) return '0원';
    var sign = v < 0 ? '-' : '';
    v = Math.abs(v);
    var eok = Math.floor(v / EOK);
    var man = Math.round((v % EOK) / MAN);
    if (man === MAN) { eok += 1; man = 0; }
    var out = [];
    if (eok > 0) out.push(eok + '억');
    if (man > 0) out.push(comma(man) + '만');
    if (out.length === 0) return sign + comma(v) + '원';
    return sign + out.join(' ') + '원';
  }

  /** 원 → "6억 5,000만" (라벨용, 원 생략) */
  function shortWon(won) {
    return koreanWon(won).replace(/원$/, '');
  }

  function percent(n, digits) {
    var d = (digits === undefined) ? 2 : digits;
    return n.toFixed(d) + '%';
  }

  /* ------------------------------------------------------------------ *
   * 1. 청약가점 (주택공급에 관한 규칙 별표 1)
   * ------------------------------------------------------------------ */

  /** 무주택기간 점수: 1년 미만 2점, 1년마다 2점, 15년 이상 32점 */
  function homelessScore(months) {
    var m = Math.max(0, Math.floor(months));
    var years = Math.floor(m / 12);
    if (years >= 15) return 32;
    return 2 * (years + 1); // 0~11개월 → 2점
  }

  /** 부양가족 점수: 0명 5점, 1명마다 5점, 6명 이상 35점 */
  function dependentScore(count) {
    var n = clamp(Math.floor(count), 0, 6);
    return 5 * (n + 1);
  }

  /** 청약통장 가입기간 점수: 6개월 미만 1점, 1년마다 1점, 15년 이상 17점 */
  function accountScore(months) {
    var m = Math.max(0, months);
    if (m < 6) return 1;
    var years = Math.floor(m / 12);
    if (years >= 15) return 17;
    return years + 2; // 6~11개월 → 2점, 12~23개월 → 3점
  }

  /** 배우자 통장 가점: 배우자 가입기간의 50%로 산정한 점수, 최대 3점 */
  function spousePoints(spouseMonths) {
    if (!spouseMonths || spouseMonths <= 0) return 0;
    return Math.min(3, accountScore(spouseMonths * 0.5));
  }

  /**
   * 청약가점 총점
   * @param {{ownMonths:number, dependents:number, accountMonths:number, spouseMonths:number, ownsHome:boolean}} o
   */
  function calcCheongyak(o) {
    var ownMonths = Math.max(0, toNum(o.ownMonths));
    var dependents = clamp(Math.floor(toNum(o.dependents)), 0, 6);
    var accountMonths = Math.max(0, toNum(o.accountMonths));
    var spouseMonths = Math.max(0, toNum(o.spouseMonths));
    var ownsHome = !!o.ownsHome;

    var ownPts = ownsHome ? 0 : homelessScore(ownMonths);
    var depPts = dependentScore(dependents);
    var accPtsBase = accountScore(accountMonths);
    var spPts = spousePoints(spouseMonths);
    var accPts = Math.min(17, accPtsBase + spPts);

    var total = ownPts + depPts + accPts;

    return {
      ownPts: ownPts,
      depPts: depPts,
      accPtsBase: accPtsBase,
      spousePts: spPts,
      accPts: accPts,
      total: total,
      max: 84,
      rate: total / 84
    };
  }

  /**
   * 무주택기간 기산일 → 오늘까지 개월 수
   * 기산 규칙: 만 30세가 되는 날. 30세 전에 혼인신고를 했다면 혼인신고일.
   * @param {{birth:string, marriage:string, today:string, lastDisposal:string}} o
   * @returns {{startDate:string|null, months:number, basis:string}}
   */
  function homelessStart(o) {
    var today = o.today ? new Date(o.today) : new Date();
    var birth = o.birth ? new Date(o.birth) : null;
    var marriage = o.marriage ? new Date(o.marriage) : null;
    if (!birth || isNaN(birth.getTime())) {
      return { startDate: null, months: 0, basis: '생년월일을 입력하면 기산일을 자동으로 계산합니다.' };
    }
    var thirty = new Date(birth.getFullYear() + 30, birth.getMonth(), birth.getDate());
    var start = thirty;
    var basis = '만 30세가 되는 날(' + fmtDate(thirty) + ')부터';
    if (marriage && !isNaN(marriage.getTime()) && marriage < thirty) {
      start = marriage;
      basis = '만 30세 이전 혼인신고일(' + fmtDate(marriage) + ')부터';
    }
    if (o.lastDisposal) {
      var d = new Date(o.lastDisposal);
      if (!isNaN(d.getTime()) && d > start) {
        start = d;
        basis = '주택 처분 후 무주택이 된 날(' + fmtDate(d) + ')부터';
      }
    }
    if (start > today) {
      return { startDate: fmtDate(start), months: 0, basis: '아직 기산일이 오지 않았습니다(만 30세 미만 미혼 → 0점).' };
    }
    var months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    if (today.getDate() < start.getDate()) months -= 1;
    return { startDate: fmtDate(start), months: Math.max(0, months), basis: basis };
  }

  function fmtDate(d) {
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 개월 → "12년 3개월" */
  function monthLabel(months) {
    var m = Math.max(0, Math.floor(months));
    var y = Math.floor(m / 12);
    var r = m % 12;
    if (y === 0) return r + '개월';
    if (r === 0) return y + '년';
    return y + '년 ' + r + '개월';
  }

  /* ------------------------------------------------------------------ *
   * 2. 주담대 DSR · 대출한도
   * ------------------------------------------------------------------ */

  /** 원리금균등 월 상환액 */
  function annuityPayment(principal, annualRatePct, months) {
    if (months <= 0) return 0;
    var r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return principal * r / (1 - Math.pow(1 + r, -months));
  }

  /** 원금균등 1년차 원리금 합계(가장 보수적인 연간 상환액) */
  function equalPrincipalFirstYear(principal, annualRatePct, months) {
    if (months <= 0) return 0;
    var n = Math.min(12, months);
    var r = annualRatePct / 100 / 12;
    var principalPart = principal * n / months;
    var interest = 0;
    for (var k = 0; k < n; k++) {
      var balance = principal - (principal / months) * k;
      interest += balance * r;
    }
    return principalPart + interest;
  }

  /** 1원당 1년차 원리금 (한도 역산용, 대출금액에 선형) */
  function yearlyServicePerWon(annualRatePct, months, method) {
    if (months <= 0) return 0;
    if (method === 'equalPrincipal') {
      return equalPrincipalFirstYear(1, annualRatePct, months);
    }
    return annuityPayment(1, annualRatePct, months) * 12;
  }

  /**
   * 주담대 한도·DSR 계산
   * @param {object} o
   *  income(원/년), rate(연 %), years(년), method('annuity'|'equalPrincipal'),
   *  stress(가산 %p), existingAnnual(기존 대출 연간 원리금, 원),
   *  limitPct(DSR 한도 %), desired(희망 대출금, 원), housePrice, area('metro'|'local'), ltv(0~1)
   */
  function calcDsr(o) {
    var income = Math.max(0, toNum(o.income));
    var rate = Math.max(0, toNum(o.rate));
    var years = clamp(toNum(o.years, 30), 1, 50);
    var months = Math.round(years * 12);
    var method = o.method === 'equalPrincipal' ? 'equalPrincipal' : 'annuity';
    var stress = Math.max(0, toNum(o.stress));
    var existing = Math.max(0, toNum(o.existingAnnual));
    var limitPct = clamp(toNum(o.limitPct, 40), 1, 100);
    var desired = Math.max(0, toNum(o.desired));

    var checkedRate = rate + stress;                 // DSR 산정에 쓰는 금리
    var annualBudget = income * limitPct / 100;       // 모든 대출의 연간 원리금 상한

    // 1) 희망 대출금 기준
    var newAnnualStressed = desired * yearlyServicePerWon(checkedRate, months, method);
    var dsrStressed = income > 0 ? (existing + newAnnualStressed) / income * 100 : 0;
    var dsrActual = income > 0
      ? (existing + desired * yearlyServicePerWon(rate, months, method)) / income * 100
      : 0;

    // 2) DSR 기준 최대 한도
    var room = Math.max(0, annualBudget - existing);
    var dsrLimitRaw = room / yearlyServicePerWon(checkedRate, months, method);
    var dsrLimit = Math.floor(dsrLimitRaw / MAN) * MAN;

    // 3) 희망 대출금의 실제 부담 (실제 금리 기준)
    var monthlyActual = method === 'equalPrincipal'
      ? desired / months + desired * (rate / 100 / 12)
      : annuityPayment(desired, rate, months);
    var monthlyStressed = method === 'equalPrincipal'
      ? desired / months + desired * (checkedRate / 100 / 12)
      : annuityPayment(desired, checkedRate, months);
    var totalInterest = 0;
    if (method === 'annuity') {
      totalInterest = annuityPayment(desired, rate, months) * months - desired;
    } else {
      var pay = desired / months;
      totalInterest = desired * (rate / 100 / 12) * (months + 1) / 2;
    }

    // 4) 규제 한도(LTV·시가별 금액한도)가 있으면 최종 한도는 가장 작은 값
    var caps = [];
    var housePrice = Math.max(0, toNum(o.housePrice));
    var ltvApplied = null;
    var priceCap = null;
    var finalLimit = dsrLimit;
    if (housePrice > 0) {
      var ltv = clamp(toNum(o.ltv, o.area === 'local' ? 0.7 : 0.4), 0, 1);
      ltvApplied = ltv;
      var ltvLimit = Math.floor(housePrice * ltv / MAN) * MAN;
      caps.push({ label: 'LTV ' + Math.round(ltv * 100) + '%', value: ltvLimit });
      if (o.area !== 'local') {
        priceCap = housePrice <= 15 * EOK ? 6 * EOK : (housePrice <= 25 * EOK ? 4 * EOK : 2 * EOK);
        caps.push({ label: '시가별 금액한도', value: priceCap });
      }
      finalLimit = Math.min.apply(null, [dsrLimit].concat(caps.map(function (c) { return c.value; })));
      finalLimit = Math.floor(finalLimit / MAN) * MAN;
    }

    return {
      income: income,
      rate: rate,
      checkedRate: checkedRate,
      stress: stress,
      months: months,
      method: method,
      limitPct: limitPct,
      annualBudget: annualBudget,
      existingAnnual: existing,
      desired: desired,
      newAnnualStressed: newAnnualStressed,
      dsrStressed: dsrStressed,
      dsrActual: dsrActual,
      dsrLimit: dsrLimit,
      finalLimit: finalLimit,
      caps: caps,
      ltvApplied: ltvApplied,
      monthlyActual: monthlyActual,
      monthlyStressed: monthlyStressed,
      totalInterest: totalInterest,
      totalPayment: desired + totalInterest,
      remainingBudget: room,
      withinLimit: dsrStressed <= limitPct + 1e-9
    };
  }

  /* ------------------------------------------------------------------ *
   * 3. 주택 취득세
   * ------------------------------------------------------------------ */

  /** 1~3% 일반세율 (주택 유상거래, 지방세법 §11①8) */
  function standardRate(price) {
    if (price <= 6 * EOK) return 0.01;
    if (price <= 9 * EOK) {
      // (취득가액 × 2 / 3억 − 3) × 1/100, 소수점 다섯째자리 반올림 → 넷째자리
      var r = (price * 2 / (3 * EOK) - 3) / 100;
      return Math.round(r * 10000) / 10000;
    }
    return 0.03;
  }

  /**
   * 적용 취득세율 결정
   * @param {{price:number, houses:number, adjusted:boolean, firstHome:string}} o
   */
  function acquisitionRate(o) {
    var price = o.price;
    var houses = clamp(Math.floor(o.houses), 1, 4);
    var adjusted = !!o.adjusted;
    var firstHome = o.firstHome || 'none';

    if (firstHome !== 'none') {
      // 생애최초 감면은 무주택자가 1주택을 취득하는 경우 → 중과 배제
      return { rate: standardRate(price), kind: 'firstHome', heavy: false };
    }
    if (houses === 1) return { rate: standardRate(price), kind: 'normal', heavy: false };
    if (houses === 2) {
      if (adjusted) return { rate: 0.08, kind: 'heavy2', heavy: true };
      return { rate: standardRate(price), kind: 'normal', heavy: false };
    }
    if (houses === 3) {
      if (adjusted) return { rate: 0.12, kind: 'heavy3', heavy: true };
      return { rate: 0.08, kind: 'heavy2', heavy: true };
    }
    return { rate: 0.12, kind: adjusted ? 'heavy3' : 'heavy4', heavy: true };
  }

  /**
   * 취득세·지방교육세·농어촌특별세 계산
   * @param {object} o price(원), houses(1~4), adjusted(bool), over85(bool), firstHome('none'|'general'|'small')
   */
  function calcAcqTax(o) {
    var price = Math.max(0, toNum(o.price));
    var rateInfo = acquisitionRate({
      price: price,
      houses: o.houses,
      adjusted: o.adjusted,
      firstHome: o.firstHome
    });
    var rate = rateInfo.rate;

    var acqGross = Math.floor(price * rate);          // 취득세 본세(감면 전)
    var eduRate = rateInfo.heavy ? 0.004 : rate * 0.1;
    var edu = Math.floor(price * eduRate);            // 지방교육세

    var farmRate = 0;
    if (o.over85) {
      if (rate >= 0.12) farmRate = 0.01;
      else if (rate >= 0.08) farmRate = 0.006;
      else farmRate = 0.002;
    }
    var farm = Math.floor(price * farmRate);          // 농어촌특별세

    // 생애최초 감면 (지방세특례제한법 §36의3)
    var reliefCap = 0;
    var reliefNote = '';
    var eligible = false;
    var firstHome = o.firstHome || 'none';
    if (firstHome !== 'none') {
      if (price > 12 * EOK) {
        reliefNote = '취득가액이 12억 원을 넘어 생애최초 감면 대상이 아닙니다.';
      } else {
        eligible = true;
        if (firstHome === 'small') {
          reliefCap = 3000000;
          reliefNote = '소형주택(전용 60㎡ 이하·3억 원 이하, 수도권 6억 원 이하) 또는 인구감소지역 주택 → 최대 300만 원 한도';
        } else {
          reliefCap = 2000000;
          reliefNote = '일반 주택 → 최대 200만 원 한도';
        }
      }
    }
    var relief = eligible ? Math.min(reliefCap, acqGross) : 0;
    var acq = acqGross - relief;

    return {
      price: price,
      rate: rate,
      rateInfo: rateInfo,
      acqGross: acqGross,
      relief: relief,
      reliefCap: reliefCap,
      reliefNote: reliefNote,
      eligible: eligible,
      acq: acq,
      eduRate: eduRate,
      edu: edu,
      farmRate: farmRate,
      farm: farm,
      total: acq + edu + farm,
      totalBeforeRelief: acqGross + edu + farm,
      effectiveRate: price > 0 ? (acq + edu + farm) / price : 0
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. 내보내기 (테스트 · UI 공용)
   * ------------------------------------------------------------------ */
  var API = {
    EOK: EOK,
    MAN: MAN,
    comma: comma,
    koreanWon: koreanWon,
    shortWon: shortWon,
    percent: percent,
    monthLabel: monthLabel,
    fmtDate: fmtDate,
    homelessScore: homelessScore,
    dependentScore: dependentScore,
    accountScore: accountScore,
    spousePoints: spousePoints,
    calcCheongyak: calcCheongyak,
    homelessStart: homelessStart,
    annuityPayment: annuityPayment,
    equalPrincipalFirstYear: equalPrincipalFirstYear,
    yearlyServicePerWon: yearlyServicePerWon,
    calcDsr: calcDsr,
    standardRate: standardRate,
    acquisitionRate: acquisitionRate,
    calcAcqTax: calcAcqTax
  };
  global.BDS = API;

  /* ------------------------------------------------------------------ *
   * 5. 화면 (DOM이 있을 때만 실행)
   * ------------------------------------------------------------------ */
  if (typeof document === 'undefined') return;

  function init() {
    setupTabs();
    setupCheongyak();
    setupDsr();
    setupAcq();
    setupCopyButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ---------- 탭 ---------- */
  function setupTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-panel]'));
    if (!tabs.length) return;

    function activate(name, push) {
      var found = false;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === name;
        if (on) found = true;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.classList.toggle('is-active', on);
        tab.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (p) {
        var on = p.getAttribute('data-panel') === name;
        p.hidden = !on;
        p.classList.toggle('is-active', on);
      });
      if (!found) return false;
      if (push) {
        history.replaceState(null, '', '#' + name);
      }
      return true;
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        activate(tab.getAttribute('data-tab'), true);
      });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (next) {
          e.preventDefault();
          next.focus();
          activate(next.getAttribute('data-tab'), true);
        }
      });
    });

    var hash = (location.hash || '').replace('#', '');
    if (!activate(hash, false)) activate('cheongyak', false);
  }

  /* ---------- 공통 헬퍼 ---------- */
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? el.value : ''; }
  function checked(id) { var el = $(id); return !!(el && el.checked); }
  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }
  function setHTML(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }
  function onChange(ids, fn) {
    ids.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', fn);
      el.addEventListener('change', fn);
    });
  }
  function bindChips(scopeId, onPick) {
    var scope = $(scopeId);
    if (!scope) return;
    scope.querySelectorAll('[data-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var payload = JSON.parse(btn.getAttribute('data-set'));
        var group = btn.parentNode;
        if (group && group.querySelectorAll) {
          group.querySelectorAll('[data-set]').forEach(function (b) { b.classList.remove('is-picked'); });
        }
        btn.classList.add('is-picked');
        onPick(payload);
      });
    });
  }

  /* ---------- 1. 청약가점 ---------- */
  function setupCheongyak() {
    var panel = $('panel-cheongyak');
    if (!panel) return;

    function read() {
      return {
        ownMonths: toNum(val('cy-own-years')) * 12 + toNum(val('cy-own-months')),
        dependents: toNum(val('cy-dependents')),
        accountMonths: toNum(val('cy-acc-years')) * 12 + toNum(val('cy-acc-months')),
        spouseMonths: checked('cy-spouse-on')
          ? toNum(val('cy-spouse-years')) * 12 + toNum(val('cy-spouse-months'))
          : 0,
        ownsHome: checked('cy-owns-home')
      };
    }

    function render() {
      var r = read();
      var res = calcCheongyak(r);
      setText('cy-total', res.total + '점');
      setText('cy-total-2', res.total + '점');
      setText('cy-total-sub', '84점 만점 · ' + percent(res.rate * 100, 1) + ' 달성');

      var bar = $('cy-bar');
      if (bar) bar.style.width = Math.min(100, res.rate * 100) + '%';

      setText('cy-own-pts', res.ownPts + '점');
      setText('cy-own-desc', r.ownsHome
        ? '유주택 → 0점'
        : monthLabel(r.ownMonths) + ' · ' + (res.ownPts >= 32 ? '만점(15년 이상)' : '다음 구간까지 ' + nextSteps(res.ownPts, 2, 32) + '점'));
      setText('cy-dep-pts', res.depPts + '점');
      setText('cy-dep-desc', clamp(Math.floor(r.dependents), 0, 6) + '명' + (r.dependents >= 6 ? ' 이상' : '') + ' · ' + (res.depPts >= 35 ? '만점' : '1명당 5점'));
      setText('cy-acc-pts', res.accPts + '점');
      setText('cy-acc-desc', monthLabel(r.accountMonths) + ' · 본인 ' + res.accPtsBase + '점'
        + (res.spousePts > 0 ? ' + 배우자 ' + res.spousePts + '점' : ''));

      // 등급 안내
      var grade, gradeClass, advice;
      if (res.total >= 70) {
        grade = '최상위권'; gradeClass = 'good';
        advice = '서울 인기 단지 가점제도 노려볼 만한 점수입니다. 자금·대출 계획과 함께 청약 일정을 관리하세요.';
      } else if (res.total >= 55) {
        grade = '중상위권'; gradeClass = 'good';
        advice = '수도권 외곽·지방 광역시의 가점제 물량에서 경쟁력이 있습니다. 추첨제 물량도 함께 노리세요.';
      } else if (res.total >= 40) {
        grade = '중위권'; gradeClass = 'mid';
        advice = '가점제보다 추첨제 비중이 높은 단지·평형을 노리는 편이 효율적입니다.';
      } else {
        grade = '추첨제 중심'; gradeClass = 'mid';
        advice = '가점보다는 추첨제·특별공급(신혼부부·생애최초) 전략이 유리합니다.';
      }
      setText('cy-grade', grade);
      var g = $('cy-grade');
      if (g) g.className = 'grade ' + gradeClass;
      setText('cy-advice', advice);

      // 기산일 자동 계산
      var helper = $('cy-helper-result');
      if (helper) {
        var birth = val('cy-birth');
        if (birth) {
          var h = homelessStart({
            birth: birth,
            marriage: val('cy-marriage'),
            lastDisposal: val('cy-disposal'),
            today: new Date().toISOString().slice(0, 10)
          });
          var ownYears = Math.floor(h.months / 12);
          var ownLeft = h.months % 12;
          setHTML('cy-helper-result',
            '<strong>' + (h.startDate || '-') + '</strong> 기산 → 오늘까지 '
            + '<strong>' + monthLabel(h.months) + '</strong>'
            + ' <button type="button" class="link-btn" id="cy-apply-helper">이 기간 적용</button>'
            + '<br><span class="muted">' + h.basis + '</span>');
          var apply = $('cy-apply-helper');
          if (apply) {
            apply.addEventListener('click', function () {
              $('cy-own-years').value = ownYears;
              $('cy-own-months').value = ownLeft;
              render();
            });
          }
        } else {
          setHTML('cy-helper-result', '<span class="muted">생년월일을 넣으면 기산일과 기간을 자동으로 계산합니다.</span>');
        }
      }
      updateShare('cy', res);
    }

    function nextSteps(current, step, max) {
      return Math.min(step, max - current);
    }

    onChange(['cy-own-years', 'cy-own-months', 'cy-dependents', 'cy-acc-years', 'cy-acc-months',
      'cy-spouse-years', 'cy-spouse-months', 'cy-spouse-on', 'cy-owns-home',
      'cy-birth', 'cy-marriage', 'cy-disposal'], render);

    var spouseBox = $('cy-spouse-fields');
    var spouseOn = $('cy-spouse-on');
    if (spouseOn && spouseBox) {
      var syncSpouse = function () { spouseBox.hidden = !spouseOn.checked; };
      spouseOn.addEventListener('change', syncSpouse);
      syncSpouse();
    }

    bindChips('panel-cheongyak', function (p) {
      if (p.ownYears !== undefined) {
        $('cy-own-years').value = p.ownYears;
        $('cy-own-months').value = p.ownMonths || 0;
      }
      if (p.dependents !== undefined) $('cy-dependents').value = p.dependents;
      if (p.accYears !== undefined) {
        $('cy-acc-years').value = p.accYears;
        $('cy-acc-months').value = p.accMonths || 0;
      }
      render();
    });

    render();
  }

  /* ---------- 2. DSR ---------- */
  function setupDsr() {
    var panel = $('panel-dsr');
    if (!panel) return;

    function read() {
      return {
        income: toNum(val('dsr-income')) * MAN,
        rate: toNum(val('dsr-rate')),
        years: toNum(val('dsr-years'), 30),
        method: (document.querySelector('input[name="dsr-method"]:checked') || {}).value || 'annuity',
        stress: toNum(val('dsr-stress')),
        existingAnnual: toNum(val('dsr-existing')) * MAN,
        limitPct: toNum(val('dsr-limit'), 40),
        desired: toNum(val('dsr-desired')) * MAN,
        housePrice: toNum(val('dsr-house-price')) * MAN,
        area: (document.querySelector('input[name="dsr-area"]:checked') || {}).value || 'metro'
      };
    }

    function render() {
      var input = read();
      var r = calcDsr(input);

      setText('dsr-dsr-value', r.dsrStressed.toFixed(1) + '%');
      var badge = $('dsr-badge');
      if (badge) {
        badge.textContent = r.withinLimit ? '한도 이내' : '한도 초과';
        badge.className = 'badge ' + (r.withinLimit ? 'badge-ok' : 'badge-warn');
      }
      var bar = $('dsr-bar');
      if (bar) {
        var w = Math.min(100, r.limitPct > 0 ? r.dsrStressed / r.limitPct * 100 : 0);
        bar.style.width = w + '%';
        bar.classList.toggle('over', !r.withinLimit);
      }
      setText('dsr-limit-label', 'DSR 한도 ' + r.limitPct + '%');
      setText('dsr-checked-rate', r.checkedRate.toFixed(2) + '%');

      setText('dsr-max', shortWon(r.dsrLimit));
      setText('dsr-max-won', comma(r.dsrLimit) + '원');
      setText('dsr-final', shortWon(r.finalLimit));
      setText('dsr-final-won', comma(r.finalLimit) + '원');

      setText('dsr-monthly', comma(r.monthlyActual) + '원');
      setText('dsr-monthly-label', r.method === 'equalPrincipal' ? '1개월차 (매달 감소)' : '매달 동일');
      setText('dsr-monthly-stressed', comma(r.monthlyStressed) + '원');
      setText('dsr-annual', comma(r.newAnnualStressed) + '원');
      setText('dsr-total-interest', shortWon(r.totalInterest));
      setText('dsr-total-payment', shortWon(r.totalPayment));
      setText('dsr-room', comma(r.remainingBudget) + '원');

      // 규제 한도 표시
      var capBox = $('dsr-caps');
      if (capBox) {
        if (input.housePrice > 0) {
          var rows = r.caps.map(function (c) {
            return '<tr><td>' + c.label + '</td><td class="num">' + shortWon(c.value) + '</td></tr>';
          }).join('');
          rows += '<tr class="is-key"><td>DSR 한도</td><td class="num">' + shortWon(r.dsrLimit) + '</td></tr>';
          rows += '<tr class="is-key"><td>최종 적용 한도(가장 작은 값)</td><td class="num">' + shortWon(r.finalLimit) + '</td></tr>';
          setHTML('dsr-caps', '<table class="mini-table"><tbody>' + rows + '</tbody></table>');
        } else {
          setHTML('dsr-caps', '<p class="muted">주택가격을 넣으면 LTV·시가별 금액한도까지 반영해 최종 한도를 계산합니다.</p>');
        }
      }

      // 요약 문장
      var note = '';
      if (!r.withinLimit) {
        note = '희망 대출금 ' + shortWon(r.desired) + '은 DSR 한도를 넘습니다. '
          + 'DSR 기준으로는 ' + shortWon(r.dsrLimit) + '까지 가능합니다.';
      } else {
        note = '희망 대출금 ' + shortWon(r.desired) + '은 DSR ' + r.dsrStressed.toFixed(1)
          + '%로 한도(' + r.limitPct + '%) 이내입니다.';
      }
      if (input.housePrice > 0 && r.finalLimit < r.dsrLimit) {
        note += ' 다만 LTV·시가별 금액한도를 적용하면 실제 한도는 ' + shortWon(r.finalLimit) + '입니다.';
      }
      setText('dsr-summary', note);

      updateShare('dsr', r);
    }

    onChange(['dsr-income', 'dsr-rate', 'dsr-years', 'dsr-stress', 'dsr-existing',
      'dsr-limit', 'dsr-desired', 'dsr-house-price'], render);
    document.querySelectorAll('input[name="dsr-method"], input[name="dsr-area"]').forEach(function (el) {
      el.addEventListener('change', render);
    });

    bindChips('panel-dsr', function (p) {
      if (p.stress !== undefined) $('dsr-stress').value = p.stress;
      if (p.income !== undefined) $('dsr-income').value = p.income;
      if (p.years !== undefined) $('dsr-years').value = p.years;
      if (p.method) {
        var el = document.querySelector('input[name="dsr-method"][value="' + p.method + '"]');
        if (el) el.checked = true;
      }
      render();
    });

    render();
  }

  /* ---------- 3. 취득세 ---------- */
  function setupAcq() {
    var panel = $('panel-acq');
    if (!panel) return;

    function read() {
      return {
        price: toNum(val('ac-price')) * MAN,
        houses: toNum(document.querySelector('input[name="ac-houses"]:checked') ? document.querySelector('input[name="ac-houses"]:checked').value : 1, 1),
        adjusted: checked('ac-adjusted'),
        over85: checked('ac-over85'),
        firstHome: (document.querySelector('input[name="ac-first"]:checked') || {}).value || 'none'
      };
    }

    function render() {
      var input = read();
      var r = calcAcqTax(input);

      setText('ac-total', comma(r.total) + '원');
      setText('ac-total-ko', koreanWon(r.total));
      setText('ac-effective', '취득가액의 ' + percent(r.effectiveRate * 100, 2));
      setText('ac-rate', percent(r.rate * 100, 2).replace('.00%', '%'));
      setText('ac-tax-rate', percent(r.rate * 100, 2));

      setText('ac-line-tax', comma(r.acqGross) + '원');
      setText('ac-line-relief', r.relief > 0 ? '-' + comma(r.relief) + '원' : '0원');
      setText('ac-line-edu', comma(r.edu) + '원');
      setText('ac-line-farm', comma(r.farm) + '원');
      setText('ac-line-total', comma(r.total) + '원');
      setText('ac-edu-rate', percent(r.eduRate * 100, 2));
      setText('ac-farm-rate', r.farmRate > 0 ? percent(r.farmRate * 100, 2) : '해당 없음');
      setText('ac-farm-desc', input.over85 ? '전용 85㎡ 초과 → 부과' : '전용 85㎡ 이하 → 면제');
      setText('ac-tax-note', '감면 전 세액은 ' + comma(r.totalBeforeRelief) + '원입니다.');

      // 적용 근거 문장
      var label = '';
      var kind = r.rateInfo.kind;
      if (kind === 'firstHome') label = '생애최초 감면 적용 → 중과 배제, 일반세율 ' + percent(r.rate * 100, 2);
      else if (kind === 'normal') label = (input.houses === 1 ? '1주택' : '조정대상지역 외 2주택') + ' → 일반세율 ' + percent(r.rate * 100, 2);
      else if (kind === 'heavy2') label = '중과 8% 적용';
      else label = '중과 12% 적용';
      if (r.rateInfo.kind === 'normal' && input.price > 6 * EOK && input.price <= 9 * EOK) {
        label += ' (6억 초과 9억 이하 누진구간)';
      }
      setText('ac-basis', label);

      var reliefLine = $('ac-relief-line');
      if (reliefLine) {
        if (r.relief > 0) {
          reliefLine.innerHTML = '<strong>생애최초 감면 ' + comma(r.relief) + '원 적용</strong> · ' + r.reliefNote;
        } else if (r.reliefNote) {
          reliefLine.innerHTML = '<span class="warn-text">' + r.reliefNote + '</span>';
        } else {
          reliefLine.innerHTML = '<span class="muted">생애최초 감면을 적용하지 않았습니다.</span>';
        }
      }

      // 6억·9억 경계 안내
      var edge = $('ac-edge');
      if (edge) {
        var msg = '';
        if (input.houses <= 1 && !r.rateInfo.heavy) {
          if (input.price > 5.9 * EOK && input.price <= 6 * EOK) msg = '6억 원 경계입니다. 6억 원을 넘기면 누진세율(1%→ 최대 3%)로 올라갑니다.';
          if (input.price > 8.9 * EOK && input.price <= 9 * EOK) msg = '9억 원 경계입니다. 9억 원을 넘기면 3% 정률이 적용됩니다.';
        }
        edge.textContent = msg;
        edge.hidden = !msg;
      }

      updateShare('ac', r);
    }

    onChange(['ac-price', 'ac-adjusted', 'ac-over85'], render);
    document.querySelectorAll('input[name="ac-houses"], input[name="ac-first"]').forEach(function (el) {
      el.addEventListener('change', render);
    });

    bindChips('panel-acq', function (p) {
      if (p.price !== undefined) $('ac-price').value = p.price;
      render();
    });

    render();
  }

  /* ---------- 공유/복사 ---------- */
  function updateShare(key, res) {
    lastResults[key] = res;
  }

  function setupCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-copy');
        var text = summaryText(kind);
        if (!text) return;
        var done = function () {
          var old = btn.textContent;
          btn.textContent = '복사 완료';
          setTimeout(function () { btn.textContent = old; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      });
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }

  function summaryText(kind) {
    var r = lastResults[kind];
    if (!r) return '';
    if (kind === 'cy') {
      return '[청약가점] ' + r.total + '점 / 84점\n'
        + '· 무주택기간 ' + r.ownPts + '점\n'
        + '· 부양가족 ' + r.depPts + '점\n'
        + '· 청약통장 ' + r.accPts + '점'
        + (r.spousePts ? ' (배우자 ' + r.spousePts + '점 포함)' : '');
    }
    if (kind === 'dsr') {
      return '[주담대 DSR] ' + r.dsrStressed.toFixed(1) + '% (한도 ' + r.limitPct + '%)\n'
        + '· DSR 산정금리 ' + r.checkedRate.toFixed(2) + '%\n'
        + '· 월 상환액 ' + comma(r.monthlyActual) + '원\n'
        + '· 최대 대출한도 ' + comma(r.dsrLimit) + '원';
    }
    if (kind === 'ac') {
      return '[취득세] ' + comma(r.total) + '원\n'
        + '· 취득세 ' + comma(r.acq) + '원\n'
        + '· 지방교육세 ' + comma(r.edu) + '원\n'
        + '· 농어촌특별세 ' + comma(r.farm) + '원';
    }
    return '';
  }
})(typeof window !== 'undefined' ? window : globalThis);
