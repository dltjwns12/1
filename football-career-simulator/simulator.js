// 축구선수 커리어 시뮬레이터 엔진 (Career Simulator Engine) - 현실적 밸런스 패치 버전

class CareerSimulator {
  constructor() {
    this.player = null;
    this.currentTeam = null;
    this.currentLeague = null;
    this.seasons = []; // history of each season
    this.achievements = new Set();
    this.unlockedAchievementsThisStep = [];
    this.pendingEvent = null;
    this.pendingTransferOffers = [];
    this.usedEvents = new Set(); // 같은 이벤트 2번 이상 반복 방지
    this.status = "init"; // "init", "academy_selection", "playing", "event_pending", "transfer_pending", "retired"
    this.gameMode = "normal"; // "intense" (1 yr), "normal" (2 yr), "express" (3 yr)
    this.startYear = 2026;
  }

  // 1. 선수 생성
  createPlayer(config) {
    const defaultOvrByPos = {
      ST: 62, LW: 61, RW: 61, CAM: 62, CM: 60, LM: 60, RM: 60,
      CDM: 60, CB: 61, LB: 60, RB: 60, GK: 62
    };

    const pos = config.position || "ST";
    const baseOvr = defaultOvrByPos[pos] || 61;
    const initialOvr = baseOvr + Math.floor(Math.random() * 5) - 2;

    const nationality = COUNTRIES_DATA.find(c => c.fifa_code === config.nationalityFifa) || COUNTRIES_DATA[0];

    // 선천적 재능 능력치 (1~99 랜덤 생성)
    // 정규분포 가중치: 35~99 범위
    const rollBase = 35 + Math.floor(Math.random() * 35) + Math.floor(Math.random() * 30);
    const talent = Math.max(35, Math.min(99, rollBase));

    let talentTier = "보통의 재능 (B)";
    let talentColor = "#10b981";
    let talentDesc = "기복 없이 꾸준히 활약할 수 있는 프로 수준의 성실한 재능입니다.";
    if (talent >= 95) {
      talentTier = "세기의 천재 (GOAT급)";
      talentColor = "#fbbf24";
      talentDesc = "축구 역사를 뒤흔들 천부적인 골 감각과 잠재력을 타고난 슈퍼스타입니다!";
    } else if (talent >= 88) {
      talentTier = "월드클래스 잠재력 (S+)";
      talentColor = "#ec4899";
      talentDesc = "유럽 최정상 무대를 정복할 압도적인 재능과 득점 본능을 갖추었습니다!";
    } else if (talent >= 80) {
      talentTier = "특급 유망주 (S)";
      talentColor = "#a855f7";
      talentDesc = "번뜩이는 센스와 테크닉으로 가파르게 성장할 특급 유망주입니다.";
    } else if (talent >= 70) {
      talentTier = "준수한 기대주 (A)";
      talentColor = "#3b82f6";
      talentDesc = "탄탄한 기본기와 잠재력으로 1부 리그 주전으로 도약할 재목입니다.";
    } else if (talent >= 58) {
      talentTier = "보통의 재능 (B)";
      talentColor = "#10b981";
      talentDesc = "프로 무대에서 묵묵히 제 몫을 다하는 평범하고 성실한 선수입니다.";
    } else if (talent >= 48) {
      talentTier = "노력형 선수 (C)";
      talentColor = "#f59e0b";
      talentDesc = "선천적 재능은 다소 부족하지만 피나는 노력으로 생존해야 합니다.";
    } else {
      talentTier = "재능 부족 (D)";
      talentColor = "#ef4444";
      talentDesc = "프로 무대의 높은 벽을 실감하며 성장에 큰 한계를 겪을 수 있습니다.";
    }

    this.player = {
      name: config.name || "김유망",
      number: config.number || 10,
      preferredFoot: config.preferredFoot || "오른발",
      position: pos,
      roleCategory: this.getRoleCategory(pos),
      nationality: nationality,
      age: 16,
      talent: talent,
      talentTier: talentTier,
      talentColor: talentColor,
      talentDesc: talentDesc,
      overall: Math.max(55, Math.min(68, initialOvr)),
      marketValue: this.calculateMarketValue(initialOvr, 16),
      wage: Math.floor(initialOvr * 300),
      suspended: false,
      injuryStatus: null,
      careerGoals: 0,
      careerAssists: 0,
      careerAppearances: 0,
      careerCleanSheets: 0,
      trophiesWon: {
        league: 0,
        cup: 0,
        continental_primary: 0,
        continental_secondary: 0,
        club_world_cup: 0,
        national_continental: 0,
        world_cup: 0
      },
      awardsWon: {
        ballon_dor: 0,
        golden_boot: 0,
        golden_glove: 0
      },
      clubHistory: []
    };

    this.usedEvents.clear();
    this.gameMode = config.mode || "normal";
    this.status = "academy_selection";
    return this.player;
  }

  getRoleCategory(pos) {
    if (["ST", "LW", "RW"].includes(pos)) return "attacker";
    if (["CAM", "CM", "LM", "RM"].includes(pos)) return "creator";
    if (["LB", "RB"].includes(pos)) return "support";
    if (["CDM", "CB"].includes(pos)) return "defensive";
    if (pos === "GK") return "goalkeeper";
    return "attacker";
  }

  // 2. 유스 아카데미 입단 제안 생성 (모국 및 해당 대륙 구단 위주)
  getYouthAcademyOffers() {
    const offers = [];
    const playerConfed = this.player.nationality.confederation || "AFC";
    const playerFifa = this.player.nationality.fifa_code;

    // 1순위: 선수의 모국 리그 팀들
    const nativeLeagues = LEAGUES_DATA.filter(l => l.country_fifa_code === playerFifa);
    if (nativeLeagues.length > 0) {
      const nativeTeams = nativeLeagues.flatMap(l => l.teams.map(t => ({ ...t, leagueName: l.name, confederation: l.confederation })));
      // 평점 2~4 사이의 팀 (K리그면 전북/울산/서울/포항/강원 등)
      this.shuffle(nativeTeams);
      for (const t of nativeTeams.slice(0, 2)) {
        offers.push(t);
      }
    }

    // 2순위: 동일 대륙의 팀들
    const confedLeagues = LEAGUES_DATA.filter(l => l.confederation === playerConfed && l.country_fifa_code !== playerFifa);
    const confedTeams = confedLeagues.flatMap(l => l.teams.map(t => ({ ...t, leagueName: l.name, confederation: l.confederation })));
    this.shuffle(confedTeams);
    for (const t of confedTeams.slice(0, 2)) {
      if (offers.length < 4 && !offers.some(o => o.id === t.id)) {
        offers.push(t);
      }
    }

    // 부족할 경우 전체 리그에서 유망주 육성형 클럽 보충
    if (offers.length < 4) {
      const allTeams = LEAGUES_DATA.flatMap(l => l.teams.map(t => ({ ...t, leagueName: l.name, confederation: l.confederation })));
      const midTier = allTeams.filter(t => t.domestic_reputation <= 3 && t.international_reputation <= 3);
      this.shuffle(midTier);
      for (const t of midTier) {
        if (offers.length >= 4) break;
        if (!offers.some(o => o.id === t.id)) {
          offers.push(t);
        }
      }
    }

    return offers.slice(0, 4);
  }

  // 3. 클럽 입단
  signWithClub(team) {
    this.currentTeam = team;
    this.currentLeague = LEAGUES_DATA.find(l => l.teams.some(t => t.id === team.id)) || {
      name: team.leagueName || "프로 리그",
      tier: 1,
      confederation: team.confederation || "UEFA"
    };

    this.player.clubHistory.push({
      teamId: team.id,
      teamName: team.name_ko || team.name,
      leagueName: this.currentLeague.name,
      joinedAge: this.player.age,
      leftAge: null
    });

    this.status = "playing";
    this.checkNextEvent();
    return team;
  }

  // 4. 다음 이벤트 생성 (중복 발생 완전 방지!)
  checkNextEvent() {
    const eventKeys = Object.keys(CAREER_EVENTS_DATA);
    // 아직 사용하지 않은 이벤트만 후보로 필터링
    let candidates = eventKeys.filter(k => 
      !this.usedEvents.has(k) &&
      k !== "injury" && k !== "injury_at_peak" && k !== "triumphant_return"
    );

    // 만약 20년 이상 플레이하여 모든 22개 이벤트를 전부 다 보았다면 풀 리셋
    if (candidates.length === 0) {
      this.usedEvents.clear();
      candidates = eventKeys.filter(k => k !== "injury" && k !== "injury_at_peak" && k !== "triumphant_return");
    }

    const pickedKey = candidates[Math.floor(Math.random() * candidates.length)];
    this.usedEvents.add(pickedKey); // 사용 목록에 추가하여 중복 차단

    this.pendingEvent = {
      key: pickedKey,
      ...CAREER_EVENTS_DATA[pickedKey]
    };
    this.status = "event_pending";
    return this.pendingEvent;
  }

  // 5. 시즌 시뮬레이션 실행
  simulateSeason(eventChoiceOptionKey = null) {
    let eventResolutionMsg = "";
    let eventBuffs = {};

    // A. 이벤트 선택지 처리
    if (this.pendingEvent && eventChoiceOptionKey) {
      const opt = this.pendingEvent.options[eventChoiceOptionKey];
      if (opt) {
        if (opt.successProb !== undefined) {
          const success = Math.random() < opt.successProb;
          const outcome = success ? opt.positive : (opt.negative || opt.positive);
          eventResolutionMsg = `[${opt.label} 결과] ` + outcome.msg;
          if (outcome.ovrDelta) this.player.overall += outcome.ovrDelta;
          if (outcome.suspended) this.player.suspended = true;
          if (outcome.trophyBoost) eventBuffs.trophyBoost = true;
          if (outcome.trophyWin) eventBuffs.trophyWin = true;
          if (outcome.rolePenalty) eventBuffs.rolePenalty = outcome.rolePenalty;
        } else {
          const outcome = opt.positive || {};
          eventResolutionMsg = `[${opt.label} 선택] ` + outcome.msg;
          if (outcome.ovrDelta) this.player.overall += outcome.ovrDelta;
          if (outcome.teamBuff) eventBuffs.teamBuff = true;
          if (outcome.leagueBoost) eventBuffs.leagueBoost = true;
          if (outcome.uclBoost) eventBuffs.uclBoost = true;
          if (outcome.rivalTransfer) eventBuffs.rivalTransfer = true;
          if (outcome.transferBoost) eventBuffs.transferBoost = true;
          if (outcome.switchNation) {
            const candidateNations = COUNTRIES_DATA.filter(c => c.international_reputation >= 3 && c.fifa_code !== this.player.nationality.fifa_code);
            if (candidateNations.length > 0) {
              const newNation = candidateNations[Math.floor(Math.random() * candidateNations.length)];
              this.player.nationality = newNation;
              eventResolutionMsg += ` (${newNation.name} 대표팀으로 소속 변경!)`;
            }
          }
        }
      }
    }

    const periodYears = this.gameMode === "intense" ? 1 : (this.gameMode === "normal" ? 2 : 3);
    const startAge = this.player.age;
    const endAge = startAge + periodYears - 1;
    const startYear = this.startYear + (startAge - 16);
    const endYear = startYear + periodYears - 1;
    const oldOvr = this.player.overall;

    let totalApps = 0;
    let totalGoals = 0;
    let totalAssists = 0;
    let totalCleanSheets = 0;
    const seasonRatings = [];
    const trophiesThisPeriod = [];
    const awardsThisPeriod = [];
    const nationalSummaries = [];
    let anyNationalCalledUp = false;
    let primarySquadRoleKr = "";
    const yearlyDetails = [];

    // 각 연도별 개별 시즌 시뮬레이션 루프 (2년이면 2시즌, 3년이면 3시즌 분량 완전 반영)
    for (let y = 0; y < periodYears; y++) {
      const curAge = startAge + y;
      const curYear = startYear + y;
      const isFirstYear = (y === 0);

      // B. 팀 내 역할 판정 (Squad Role)
      const teamIntRep = this.currentTeam.international_reputation || 0;
      const requiredOvr = [58, 66, 74, 80, 85, 89][Math.min(5, teamIntRep)];
      const ovrDiff = this.player.overall - requiredOvr;

      let squadRole = "starter";
      let squadRoleKr = "확고한 주전";
      if (this.player.suspended) {
        squadRole = "suspended";
        squadRoleKr = "출장 정지 징계";
      } else if (this.player.roleCategory === "goalkeeper") {
        if (ovrDiff >= 0) { squadRole = "starter"; squadRoleKr = "주전 골키퍼"; }
        else if (ovrDiff >= -4) { squadRole = "substitute"; squadRoleKr = "서브 골키퍼"; }
        else { squadRole = "bench"; squadRoleKr = "3rd 골키퍼"; }
      } else {
        if (ovrDiff >= 3) { squadRole = "starter"; squadRoleKr = "팀의 핵심 에이스"; }
        else if (ovrDiff >= -2) { squadRole = "starter"; squadRoleKr = "선발 주전"; }
        else if (ovrDiff >= -6) { squadRole = "rotation"; squadRoleKr = "주요 로테이션"; }
        else if (ovrDiff >= -9) { squadRole = "substitute"; squadRoleKr = "후보 서브"; }
        else { squadRole = "bench"; squadRoleKr = "2군 / 벤치"; }
      }

      if (isFirstYear && eventBuffs.rolePenalty) {
        squadRole = "substitute";
        squadRoleKr = "감독 불화로 인한 후보 강등";
      }

      if (y === 0) primarySquadRoleKr = squadRoleKr;

      // C. 출전 경기 수 계산 (단일 시즌 기준)
      // 주전 30~50경기, 후보 10~30경기, 2군 10경기 안으로 반영
      let apps = 0;
      if (this.player.suspended) {
        apps = 1 + Math.floor(Math.random() * 6); // 1~6경기 (징계)
        this.player.suspended = false; // 1시즌 소화 후 징계 해제
      } else if (squadRole === "starter") {
        if (squadRoleKr === "팀의 핵심 에이스") {
          apps = 38 + Math.floor(Math.random() * 13); // 38~50경기
        } else {
          apps = 30 + Math.floor(Math.random() * 16); // 30~45경기
        }
      } else if (squadRole === "rotation") {
        apps = 20 + Math.floor(Math.random() * 11); // 20~30경기 (후보 상위)
      } else if (squadRole === "substitute") {
        apps = 10 + Math.floor(Math.random() * 11); // 10~20경기 (후보 서브)
      } else {
        apps = 1 + Math.floor(Math.random() * 9); // 1~9경기 (2군/벤치: 10경기 안으로)
      }

      // D. 골 & 도움 계산 (선천적 재능 능력치 반영: 재능 높으면 득점 폭발, 낮으면 부진)
      const ovr = this.player.overall;
      const talent = this.player.talent || 70;
      // 재능 계수: 70 기준 1.0, 95면 1.37(+37%), 45면 0.62(-38%)
      const talentGoalMod = Math.max(0.40, 1.0 + (talent - 70) * 0.015);
      const talentAssistMod = Math.max(0.50, 1.0 + (talent - 70) * 0.010);

      let goals = 0;
      let assists = 0;
      let cleanSheets = 0;

      if (this.player.roleCategory === "attacker") {
        const gRate = 0.12 + Math.max(0, (ovr - 58) * 0.015);
        goals = Math.max(0, Math.round(apps * gRate * talentGoalMod * (0.82 + Math.random() * 0.35)));
        const aRate = 0.06 + Math.max(0, (ovr - 58) * 0.005);
        assists = Math.max(0, Math.round(apps * aRate * talentAssistMod * (0.75 + Math.random() * 0.5)));
      } else if (this.player.roleCategory === "creator") {
        const gRate = 0.06 + Math.max(0, (ovr - 58) * 0.007);
        goals = Math.max(0, Math.round(apps * gRate * talentGoalMod * (0.75 + Math.random() * 0.45)));
        const aRate = 0.14 + Math.max(0, (ovr - 58) * 0.012);
        assists = Math.max(0, Math.round(apps * aRate * talentAssistMod * (0.80 + Math.random() * 0.4)));
      } else if (this.player.roleCategory === "support") {
        const gRate = 0.02 + Math.max(0, (ovr - 60) * 0.002);
        goals = Math.max(0, Math.round(apps * gRate * talentGoalMod * (0.5 + Math.random() * 1.0)));
        const aRate = 0.08 + Math.max(0, (ovr - 58) * 0.006);
        assists = Math.max(0, Math.round(apps * aRate * talentAssistMod * (0.75 + Math.random() * 0.5)));
      } else if (this.player.roleCategory === "defensive") {
        const gRate = 0.02 + Math.max(0, (ovr - 60) * 0.002);
        goals = Math.max(0, Math.round(apps * gRate * talentGoalMod * (0.5 + Math.random() * 1.0)));
        const aRate = 0.03 + Math.max(0, (ovr - 60) * 0.003);
        assists = Math.max(0, Math.round(apps * aRate * talentAssistMod * (0.5 + Math.random() * 1.0)));
      } else if (this.player.roleCategory === "goalkeeper") {
        goals = 0;
        assists = Math.random() < 0.04 ? 1 : 0;
        const talentCsMod = Math.max(0.65, 1.0 + (talent - 70) * 0.008);
        const csRate = 0.22 + Math.max(0, (ovr - 60) * 0.007);
        cleanSheets = Math.round(apps * Math.min(0.50, csRate * talentCsMod) * (0.85 + Math.random() * 0.3));
      }

      // 경기 평점 계산 (6.3 ~ 8.9)
      const baseRating = 6.6 + (this.player.overall - 60) * 0.035;
      const ratingNoise = (Math.random() * 0.5) - 0.25;
      const statBonus = (goals * 0.02 + assists * 0.015);
      const seasonRating = Math.min(8.9, Math.max(6.3, parseFloat((baseRating + ratingNoise + statBonus).toFixed(2))));
      seasonRatings.push(seasonRating);

      // 누적 합산
      totalApps += apps;
      totalGoals += goals;
      totalAssists += assists;
      totalCleanSheets += cleanSheets;

      // E. 해당 연도 트로피 우승 시뮬레이션
      const yearTrophies = [];
      const teamStars = this.currentTeam.star_rating || 2.5;

      // 1) 리그 우승
      let leagueProb = 0.01;
      if (teamStars >= 5.0) leagueProb = 0.42;
      else if (teamStars >= 4.5) leagueProb = 0.22;
      else if (teamStars >= 4.0) leagueProb = 0.10;
      else if (teamStars >= 3.5) leagueProb = 0.03;
      else leagueProb = 0.008;

      if (this.player.overall >= 88 && squadRole === "starter") leagueProb += 0.06;
      if (isFirstYear && eventBuffs.leagueBoost) leagueProb *= 1.8;
      if (Math.random() < Math.min(0.80, leagueProb)) {
        const trName = periodYears > 1 ? `${curYear} ${this.currentLeague.name} 우승` : `${this.currentLeague.name} 우승`;
        const tr = { key: "league", name: trName, icon: "🏆", year: curYear };
        yearTrophies.push(tr);
        trophiesThisPeriod.push(tr);
        this.player.trophiesWon.league++;
      }

      // 2) 국내 FA컵 우승
      let cupProb = 0.01;
      if (teamStars >= 5.0) cupProb = 0.18;
      else if (teamStars >= 4.5) cupProb = 0.13;
      else if (teamStars >= 4.0) cupProb = 0.08;
      else if (teamStars >= 3.5) cupProb = 0.04;
      else cupProb = 0.015;

      if (Math.random() < cupProb) {
        const trName = periodYears > 1 ? `${curYear} 국내 FA컵 우승` : "국내 FA컵 우승";
        const tr = { key: "cup", name: trName, icon: "🥇", year: curYear };
        yearTrophies.push(tr);
        trophiesThisPeriod.push(tr);
        this.player.trophiesWon.cup++;
      }

      // 3) 대륙 챔피언스리그
      let uclProb = 0;
      if (teamStars >= 5.0) uclProb = 0.15;
      else if (teamStars >= 4.5) uclProb = 0.08;
      else if (teamStars >= 4.0) uclProb = 0.03;
      else if (teamStars >= 3.5) uclProb = 0.008;

      if (this.player.overall >= 92 && squadRole === "starter") uclProb += 0.05;
      if (isFirstYear && eventBuffs.uclBoost) uclProb *= 1.8;
      if (isFirstYear && eventBuffs.trophyWin) uclProb = 1.0;
      if (uclProb > 0 && Math.random() < Math.min(0.75, uclProb)) {
        const uclBase = TOURNAMENTS_INFO[this.currentLeague.confederation]?.continental_primary?.name || "대륙 챔피언스리그";
        const trName = periodYears > 1 ? `${curYear} ${uclBase} 우승` : `${uclBase} 우승`;
        const tr = { key: "continental_primary", name: trName, icon: "⭐", year: curYear };
        yearTrophies.push(tr);
        trophiesThisPeriod.push(tr);
        this.player.trophiesWon.continental_primary++;
      }

      // 4) FIFA 클럽 월드컵
      if (yearTrophies.some(t => t.key === "continental_primary")) {
        const isEuropeOrSouthAmerica = ["UEFA", "CONMEBOL"].includes(this.currentLeague.confederation);
        const cwcProb = isEuropeOrSouthAmerica ? 0.35 : 0.10;
        if (Math.random() < cwcProb) {
          const trName = periodYears > 1 ? `${curYear} FIFA 클럽 월드컵 우승` : "FIFA 클럽 월드컵 우승";
          const tr = { key: "club_world_cup", name: trName, icon: "🌐", year: curYear };
          yearTrophies.push(tr);
          trophiesThisPeriod.push(tr);
          this.player.trophiesWon.club_world_cup++;
        }
      }

      // F. 국가대표팀 시뮬레이션 (해당 연도 주기 정확 반영)
      const fifaCode = this.player.nationality.fifa_code;
      const tier1Giants = ["BRA", "ARG", "FRA", "GER", "ESP", "ENG"];
      const tier2Contenders = ["POR", "NED", "ITA", "BEL", "CRO", "URU"];
      const tier3DarkHorses = ["KOR", "JPN", "USA", "MEX", "SEN", "MAR", "SUI", "DEN", "COL"];

      let callUpThreshold = 75;
      if (tier1Giants.includes(fifaCode)) callUpThreshold = 83;
      else if (tier2Contenders.includes(fifaCode)) callUpThreshold = 80;
      else if (tier3DarkHorses.includes(fifaCode)) callUpThreshold = 74;

      if (this.player.overall >= callUpThreshold) {
        anyNationalCalledUp = true;
        // 1) FIFA 월드컵 (4년 주기)
        if (curYear % 4 === 0) {
          let wcProb = 0.0005;
          if (tier1Giants.includes(fifaCode)) {
            wcProb = 0.16;
            if (this.player.overall >= 92) wcProb += 0.05;
          } else if (tier2Contenders.includes(fifaCode)) {
            wcProb = 0.06;
            if (this.player.overall >= 92) wcProb += 0.03;
          } else if (tier3DarkHorses.includes(fifaCode)) {
            wcProb = 0.003;
            if (this.player.overall >= 95) wcProb += 0.012;
            else if (this.player.overall >= 90) wcProb += 0.005;
          } else {
            wcProb = 0.0002;
            if (this.player.overall >= 95) wcProb += 0.001;
          }

          if (Math.random() < wcProb) {
            const tr = { key: "world_cup", name: `${curYear} FIFA 월드컵 우승`, icon: "🏆", year: curYear };
            yearTrophies.push(tr);
            trophiesThisPeriod.push(tr);
            this.player.trophiesWon.world_cup++;
            nationalSummaries.push(`기적의 신화! ${curYear} ${this.player.nationality.name} 월드컵 트로피 제패!`);
          } else {
            nationalSummaries.push(`${curYear} FIFA 월드컵 본선 출전`);
          }
        }
        // 2) 대륙 선수권 (4년 주기, 짝수 해, 월드컵과 2년 차이)
        else if (curYear % 2 === 0) {
          let contNatProb = 0.05;
          const confed = this.player.nationality.confederation;
          const confedInfo = TOURNAMENTS_INFO[confed]?.national_continental;
          const contName = confedInfo ? confedInfo.name : "대륙 선수권 대회";

          if (confed === "AFC") {
            if (["KOR", "JPN", "KSA", "IRN", "AUS"].includes(fifaCode)) {
              contNatProb = 0.22;
              if (this.player.overall >= 88) contNatProb += 0.12;
            } else {
              contNatProb = 0.03;
            }
          } else if (confed === "UEFA") {
            if (tier1Giants.includes(fifaCode)) contNatProb = 0.18;
            else if (tier2Contenders.includes(fifaCode)) contNatProb = 0.10;
            else contNatProb = 0.02;
            if (this.player.overall >= 90) contNatProb += 0.05;
          } else if (confed === "CONMEBOL") {
            if (["ARG", "BRA"].includes(fifaCode)) contNatProb = 0.38;
            else if (["URU", "COL"].includes(fifaCode)) contNatProb = 0.14;
            else contNatProb = 0.04;
            if (this.player.overall >= 90) contNatProb += 0.08;
          }

          if (Math.random() < contNatProb) {
            const tr = { key: "national_continental", name: `${curYear} ${contName} 우승`, icon: "🥇", year: curYear };
            yearTrophies.push(tr);
            trophiesThisPeriod.push(tr);
            this.player.trophiesWon.national_continental++;
            nationalSummaries.push(`${curYear} ${this.player.nationality.name} 대표팀 ${contName} 정상 등극!`);
          } else {
            nationalSummaries.push(`${curYear} ${this.player.nationality.name} 대표팀 ${contName} 출전`);
          }
        }
      }

      // G. 해당 연도 개인 수상 시뮬레이션
      // 1) 발롱도르
      if (this.player.overall >= 88 && squadRole === "starter") {
        let bdorProb = 0;
        const wonUcl = yearTrophies.some(t => t.key === "continental_primary");
        const wonWc = yearTrophies.some(t => t.key === "world_cup");
        const wonLeague = yearTrophies.some(t => t.key === "league");

        if (this.player.overall >= 96) bdorProb = 0.95;
        else if (this.player.overall >= 93) bdorProb = (wonUcl || wonWc) ? 0.85 : (wonLeague ? 0.65 : 0.45);
        else if (this.player.overall >= 90) bdorProb = (wonUcl || wonWc) ? 0.60 : (wonLeague ? 0.30 : 0.15);
        else if (this.player.overall >= 88) bdorProb = (wonUcl || wonWc) ? 0.25 : 0.05;

        if (this.player.roleCategory === "support") bdorProb *= 0.5;
        if (this.player.roleCategory === "defensive") bdorProb *= 0.3;
        if (this.player.roleCategory === "goalkeeper") bdorProb *= 0.15;

        if (Math.random() < bdorProb) {
          const awName = periodYears > 1 ? `${curYear} 발롱도르(Ballon d'Or) 수상` : "세계 최고 권위 [발롱도르] 수상";
          const aw = { key: "ballon_dor", name: awName, icon: "🌟", year: curYear };
          awardsThisPeriod.push(aw);
          this.player.awardsWon.ballon_dor++;
        }
      }

      // 2) 골든슈 (득점왕)
      if (this.player.roleCategory === "attacker" && goals >= 32 && squadRole === "starter") {
        let bootProb = goals >= 42 ? 0.90 : (goals >= 36 ? 0.65 : 0.35);
        if (Math.random() < bootProb) {
          const awName = periodYears > 1 ? `${curYear} 골든슈(득점왕) 수상` : "시즌 득점왕 [유러피언 골든슈] 수상";
          const aw = { key: "golden_boot", name: awName, icon: "👟", year: curYear };
          awardsThisPeriod.push(aw);
          this.player.awardsWon.golden_boot++;
        }
      }

      // 3) 야신상 (골든글러브)
      if (this.player.roleCategory === "goalkeeper" && cleanSheets >= 20 && this.player.overall >= 85) {
        if (Math.random() < 0.65) {
          const awName = periodYears > 1 ? `${curYear} 야신상(골든글러브) 수상` : "올해의 골키퍼 [야신상] 수상";
          const aw = { key: "golden_glove", name: awName, icon: "🧤", year: curYear };
          awardsThisPeriod.push(aw);
          this.player.awardsWon.golden_glove++;
        }
      }

      // I. 해당 연도 성장 곡선 (OVR 변화 - 선천적 재능 능력치 핵심 반영!)
      const potentialCap = Math.min(96, Math.max(66, Math.floor(talent * 0.96 + 3)));
      let growthDelta = 0;

      if (curAge <= 18) {
        growthDelta = 1 + Math.floor(Math.random() * 3);
        if (talent >= 88) growthDelta += (1 + (Math.random() < 0.6 ? 1 : 0)); // 재능 88+ 추가 폭풍 성장
        else if (talent >= 75 && Math.random() < 0.6) growthDelta += 1;
        else if (talent <= 50) growthDelta = Math.max(0, growthDelta - 1); // 저재능 성장 정체
      } else if (curAge <= 21) {
        growthDelta = 1 + Math.floor(Math.random() * 3);
        if (talent >= 88) growthDelta += (1 + (Math.random() < 0.6 ? 1 : 0));
        else if (talent >= 75 && Math.random() < 0.5) growthDelta += 1;
        else if (talent <= 50) growthDelta = Math.max(0, growthDelta - 1);
      } else if (curAge <= 24) {
        growthDelta = 1 + Math.floor(Math.random() * 2);
        if (talent >= 85) growthDelta += (Math.random() < 0.7 ? 1 : 0);
        else if (talent <= 55) growthDelta = Math.max(0, growthDelta - 1);
      } else if (curAge <= 27) {
        growthDelta = Math.floor(Math.random() * 2);
        if (talent >= 90 && Math.random() < 0.6) growthDelta += 1; // 특급 재능은 20대 중후반에도 성장
        else if (talent <= 55 && Math.random() < 0.5) growthDelta = -1; // 저재능은 이른 정체/쇠퇴
      } else if (curAge <= 30) {
        growthDelta = Math.floor(Math.random() * 3) - 1;
        if (talent >= 88 && growthDelta < 0) growthDelta = 0; // 특급 선수는 30세까지 전성기 유지
      } else if (curAge <= 33) {
        growthDelta = -(1 + Math.floor(Math.random() * 2));
        if (talent >= 88 && Math.random() < 0.5) growthDelta += 1;
      } else {
        growthDelta = -(2 + Math.floor(Math.random() * 2));
      }

      if (squadRole === "substitute" || squadRole === "bench") {
        growthDelta = Math.max(-3, growthDelta - 1);
      }

      // 재능 상한선(포텐셜 캡)에 다다르면 성장 감속
      if (this.player.overall >= potentialCap && growthDelta > 0) {
        growthDelta = (talent >= 95 && Math.random() < 0.3) ? 1 : 0;
      }

      this.player.overall = Math.max(50, Math.min(potentialCap, this.player.overall + growthDelta));

      yearlyDetails.push({
        year: curYear,
        age: curAge,
        apps,
        goals,
        assists,
        cleanSheets,
        rating: seasonRating,
        trophies: [...yearTrophies],
        growthDelta
      });
    }

    // H. 선수 누적 스탯 갱신 (전체 기간 분량 완전 누적!)
    this.player.careerAppearances += totalApps;
    this.player.careerGoals += totalGoals;
    this.player.careerAssists += totalAssists;
    this.player.careerCleanSheets += totalCleanSheets;

    const finalAge = startAge + periodYears;
    this.player.marketValue = this.calculateMarketValue(this.player.overall, finalAge);
    this.player.wage = Math.floor(this.player.overall * 800 * (finalAge >= 25 ? 1.5 : 1.0));

    const avgRating = seasonRatings.length > 0
      ? (seasonRatings.reduce((sum, r) => sum + r, 0) / seasonRatings.length)
      : 7.0;

    let finalEventMsg = eventResolutionMsg;
    if (periodYears > 1) {
      const avgApps = Math.round(totalApps / periodYears);
      const avgGoals = Math.round(totalGoals / periodYears);
      const summaryTag = `[${periodYears}시즌 총결산] 총 ${totalApps}경기 출전, ${totalGoals}골 ${totalAssists}도움 (시즌당 평균 ${avgApps}경기, ${avgGoals}골)`;
      finalEventMsg = eventResolutionMsg ? `${eventResolutionMsg} ➔ ${summaryTag}` : summaryTag;
    }

    // J. 시즌 기록 레코드 보관
    const seasonRecord = {
      seasonIndex: this.seasons.length + 1,
      year: periodYears === 1 ? startYear : `${startYear}~${endYear}`,
      age: periodYears === 1 ? startAge : `${startAge}~${endAge}`,
      tableYear: periodYears === 1 ? `${startYear} (${startAge}세)` : `${startYear}~${endYear} (${startAge}~${endAge}세)`,
      yearTag: periodYears === 1 ? `${startYear}년 (${startAge}세 시즌)` : `${startYear}~${endYear}년 (${startAge}~${endAge}세 / ${periodYears}개 시즌 합산)`,
      periodYears: periodYears,
      team: { ...this.currentTeam },
      league: { ...this.currentLeague },
      role: primarySquadRoleKr,
      ovrStart: oldOvr,
      ovrEnd: this.player.overall,
      appearances: totalApps,
      goals: totalGoals,
      assists: totalAssists,
      cleanSheets: totalCleanSheets,
      rating: parseFloat(avgRating.toFixed(2)),
      trophies: trophiesThisPeriod,
      awards: awardsThisPeriod,
      nationalCalledUp: anyNationalCalledUp,
      nationalSummary: nationalSummaries.length > 0 ? nationalSummaries.join(" / ") : null,
      eventMsg: finalEventMsg,
      yearlyDetails: yearlyDetails
    };
    this.seasons.push(seasonRecord);

    // K. 업적 달성 검사
    this.checkAchievements();

    // L. 나이 증가
    this.player.age += periodYears;

    // M. 은퇴 검사
    if (this.player.age >= 40) {
      this.status = "retired";
      return { seasonRecord, retired: true };
    }

    // N. 이적 시장 제안 생성
    this.generateTransferOffers(eventBuffs.transferBoost || eventBuffs.rivalTransfer);

    if (this.pendingTransferOffers.length > 0) {
      this.status = "transfer_pending";
    } else {
      this.checkNextEvent();
    }

    return { seasonRecord, retired: false };
  }

  // 6. 이적 제안 생성 (FIFA 성급 기반 매칭)
  generateTransferOffers(forceBoost = false) {
    this.pendingTransferOffers = [];
    const ovr = this.player.overall;

    const currentStars = this.currentTeam.star_rating || 2.5;
    const targetStars = forceBoost 
      ? Math.min(5.0, currentStars + 1.0) 
      : (ovr >= 86 ? 5.0 : (ovr >= 82 ? 4.5 : (ovr >= 78 ? 4.0 : (ovr >= 74 ? 3.5 : (ovr >= 69 ? 3.0 : 2.5)))));

    // 오퍼 발생 확률 (우수 활약 시 제안)
    if (forceBoost || Math.random() < 0.45) {
      const allTeams = LEAGUES_DATA.flatMap(l => l.teams.map(t => ({ ...t, leagueName: l.name, confederation: l.confederation })));
      const candidates = allTeams.filter(t => t.id !== this.currentTeam.id && Math.abs((t.star_rating || 2.5) - targetStars) <= 0.6);
      this.shuffle(candidates);

      this.pendingTransferOffers = candidates.slice(0, 3).map(team => {
        const teamStars = team.star_rating || 2.5;
        const promisedRole = (ovr >= (teamStars * 17)) ? "핵심 주전" : "로테이션 / 경쟁";
        return {
          team: team,
          transferFee: Math.floor(this.player.marketValue * (1.1 + Math.random() * 0.3)),
          wageOffer: Math.floor(this.player.wage * (1.15 + Math.random() * 0.4)),
          rolePromised: promisedRole
        };
      });
    }
  }

  // 이적 수락
  acceptTransfer(offer) {
    const lastHistory = this.player.clubHistory[this.player.clubHistory.length - 1];
    if (lastHistory) {
      lastHistory.leftAge = this.player.age;
    }

    this.signWithClub(offer.team);
    this.pendingTransferOffers = [];
    this.checkNextEvent();
  }

  // 현재 팀 잔류
  stayAtCurrentClub() {
    this.pendingTransferOffers = [];
    this.checkNextEvent();
  }

  // 조기 은퇴
  retireNow() {
    this.status = "retired";
    this.checkAchievements();
  }

  // 7. 업적 판정 엔진
  checkAchievements() {
    const s = this.seasons;
    const t = this.player.trophiesWon;
    const a = this.player.awardsWon;
    const newlyUnlocked = [];

    const awardCheck = (key, condition) => {
      if (!this.achievements.has(key) && condition) {
        this.achievements.add(key);
        newlyUnlocked.push({ key, ...ACHIEVEMENTS_DATA[key] });
      }
    };

    // 1) king_of_america
    const wonCopaAmerica = s.some(sn => sn.trophies.some(tr => tr.key === "national_continental") && this.player.nationality.confederation === "CONMEBOL");
    const wonLibertadores = s.some(sn => sn.trophies.some(tr => tr.key === "continental_primary") && sn.league.confederation === "CONMEBOL");
    awardCheck("king_of_america", wonCopaAmerica && wonLibertadores);

    // 2) one_club_legend
    const isOneClub = this.player.clubHistory.length === 1;
    awardCheck("one_club_legend", isOneClub && t.league >= 1 && t.cup >= 1 && t.continental_primary >= 1);

    // 3) europe_owner (5대 빅리그 모두 우승)
    const big5Countries = new Set(["ESP", "ENG", "ITA", "GER", "FRA"]);
    const wonLeagues = new Set(s.filter(sn => sn.trophies.some(tr => tr.key === "league")).map(sn => sn.league.country_fifa_code));
    const wonBig5Count = [...big5Countries].filter(c => wonLeagues.has(c)).length;
    awardCheck("europe_owner", wonBig5Count >= 5);

    // 4) mr_champions
    awardCheck("mr_champions", t.continental_primary >= 5);

    // 5) goat
    awardCheck("goat", t.world_cup >= 1 && t.national_continental >= 2 && a.ballon_dor >= 8 && t.continental_primary >= 4);

    // 6) only_pele
    awardCheck("only_pele", t.world_cup >= 3 && this.player.careerGoals >= 1000);

    // 7) black_spider
    awardCheck("black_spider", a.golden_glove >= 6);

    // 8) net_terror
    awardCheck("net_terror", a.golden_boot >= 6);

    // 9) most_decorated
    const totalTrophies = Object.values(t).reduce((sum, v) => sum + v, 0);
    awardCheck("most_decorated", totalTrophies >= 49);

    // 10) ringless (무관)
    if (this.status === "retired") {
      awardCheck("ringless", totalTrophies === 0);
    }

    // 11) national_hero (비전통 우승국 국대로 월드컵 우승 - 한국 등)
    const traditionalWinners = new Set(["BRA", "ITA", "GER", "ARG", "ESP", "FRA", "URU", "ENG"]);
    awardCheck("national_hero", t.world_cup >= 1 && !traditionalWinners.has(this.player.nationality.fifa_code));

    // 12) the_world_is_yours
    awardCheck("the_world_is_yours", t.world_cup >= 1 && t.club_world_cup >= 1);

    // 13) from_the_periphery (유럽/남미 외 국적으로 발롱도르)
    const nonEuroSouth = ["AFC", "CAF", "CONCACAF", "OFC"].includes(this.player.nationality.confederation);
    awardCheck("from_the_periphery", a.ballon_dor >= 1 && nonEuroSouth);

    // 14) nomad
    const visitedConfeds = new Set(s.map(sn => sn.league.confederation).filter(Boolean));
    awardCheck("nomad", visitedConfeds.size >= 4);

    // 15) the_treble (단일 시즌 트레블)
    const hadTreble = s.some(sn => {
      if (sn.yearlyDetails && sn.yearlyDetails.length > 0) {
        return sn.yearlyDetails.some(yd => {
          const keys = yd.trophies.map(tr => tr.key);
          return keys.includes("league") && keys.includes("cup") && keys.includes("continental_primary");
        });
      }
      const keys = sn.trophies.map(tr => tr.key);
      return keys.includes("league") && keys.includes("cup") && keys.includes("continental_primary");
    });
    awardCheck("the_treble", hadTreble);

    // 16) matagigantes (소형 클럽으로 챔스 우승)
    const wonUnderdogUcl = s.some(sn => sn.trophies.some(tr => tr.key === "continental_primary") && (sn.team.continental_reputation || 0) <= 2);
    awardCheck("matagigantes", wonUnderdogUcl);

    // 17) complete_football
    awardCheck("complete_football", t.world_cup >= 1 && t.national_continental >= 1 && t.continental_primary >= 1 && t.league >= 1 && t.cup >= 1 && a.ballon_dor >= 1);

    this.unlockedAchievementsThisStep = newlyUnlocked;
  }

  // 8. 명예의 전당 (Hall of Fame) 평가
  getHallOfFameSummary() {
    const p = this.player;
    const t = p.trophiesWon;
    const a = p.awardsWon;
    const totalTrophies = Object.values(t).reduce((sum, v) => sum + v, 0);

    let score = (p.careerGoals * 1.5) + (p.careerAssists * 1.0) + (p.careerAppearances * 0.5)
      + (t.league * 30) + (t.cup * 15) + (t.continental_primary * 50) + (t.world_cup * 120)
      + (t.national_continental * 40) + (a.ballon_dor * 100) + (a.golden_boot * 40)
      + (a.golden_glove * 40);

    let rankTitle = "유망주에 머문 커리어";
    let tierBadge = "등급 C";
    let description = "프로 무대에 발을 내딛었으나 아쉬움을 남긴 채 축구화를 벗었습니다.";

    if (this.achievements.has("goat") || score >= 2500) {
      rankTitle = "축구의 신 (G.O.A.T)";
      tierBadge = "신화 (MYTHIC)";
      description = "펠레, 마라도나, 메시와 어깨를 나란히 하며 축구 역사 그 자체가 된 영원한 전설입니다.";
    } else if (score >= 1800 || (t.world_cup >= 1 && t.continental_primary >= 2 && a.ballon_dor >= 1)) {
      rankTitle = "올타임 레전드 (All-Time Legend)";
      tierBadge = "레전드 (LEGEND)";
      description = "세계 축구사를 뒤흔든 불멸의 아이콘. 팬들은 세대를 넘어 당신의 이름을 찬양합니다.";
    } else if (score >= 1200 || (a.ballon_dor >= 1 || t.continental_primary >= 2)) {
      rankTitle = "월드 클래스 (World Class)";
      tierBadge = "월드클래스 (TIER S)";
      description = "당대 최고의 선수 중 한 명으로 군림하며 축구계 최정상에서 빛났습니다.";
    } else if (score >= 800 || totalTrophies >= 10) {
      rankTitle = "대륙의 슈퍼스타 (Continental Superstar)";
      tierBadge = "슈퍼스타 (TIER A)";
      description = "빅리그를 호령하고 수많은 트로피를 수집한 위대한 축구 스타입니다.";
    } else if (score >= 500 || totalTrophies >= 4) {
      rankTitle = "리그의 스타 (League Star)";
      tierBadge = "베테랑 (TIER B)";
      description = "소속팀 팬들의 뜨거운 사랑을 받으며 훌륭한 족적을 남긴 스타 플레이어입니다.";
    } else if (totalTrophies === 0 && p.overall >= 82) {
      rankTitle = "비운의 천재 (Uncrowned King)";
      tierBadge = "무관의 제왕";
      description = "기량은 뛰어났으나 팀의 우승 복이 지독하게 없었던 비운의 슈퍼스타였습니다.";
    } else {
      rankTitle = "프로의 모범 (Solid Professional)";
      tierBadge = "프로 (TIER C)";
      description = "오랜 시간 성실하게 그라운드를 누비며 멋진 축구 인생을 완주했습니다.";
    }

    return {
      score: Math.round(score),
      rankTitle,
      tierBadge,
      description,
      player: p,
      totalTrophies,
      achievementsCount: this.achievements.size,
      totalSeasons: this.seasons.length
    };
  }

  calculateMarketValue(ovr, age) {
    const scale = [
      [50, 100000], [55, 250000], [60, 500000], [65, 1200000],
      [70, 3000000], [75, 6000000], [80, 18000000], [85, 55000000],
      [90, 120000000], [95, 180000000], [99, 260000000]
    ];
    let base = 500000;
    for (let i = 0; i < scale.length - 1; i++) {
      if (ovr >= scale[i][0] && ovr <= scale[i+1][0]) {
        const ratio = (ovr - scale[i][0]) / (scale[i+1][0] - scale[i][0]);
        base = scale[i][1] + ratio * (scale[i+1][1] - scale[i][1]);
        break;
      }
    }
    const ageMultiplier = age <= 21 ? 1.4 : (age <= 26 ? 1.2 : (age <= 30 ? 1.0 : (age <= 33 ? 0.6 : 0.2)));
    return Math.round(base * ageMultiplier);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
