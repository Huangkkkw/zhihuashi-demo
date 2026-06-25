/* ====== 智划师 Demo - 总行程整合规划 ====== */
(function () {
  'use strict';

  var state = {
    phase: 'idle',
    currentDay: 0,
    currentWeek: 0,
    demands: [],
    schedule: null,
    reminderOn: true,
    autoNextOn: true,
    reminderShown: {},
    dialogQueue: [],
    dialogIndex: 0,
    waitingForAnswer: false,
    authMode: 'login',
    currentUser: null
  };

  var ZHS = {};
  var chatArea = document.getElementById('chatArea');
  var demandIdCounter = 0;

  /* ====== 登录/注册 ====== */
  // 默认用户名为"智划师"，不强制登录
  state.currentUser = '智划师';

  ZHS.showAuth = function () {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authUsername').focus();
  };

  ZHS.hideAuth = function () {
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
  };

  ZHS.toggleAuthMode = function () {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    document.getElementById('authTitle').textContent = state.authMode === 'login' ? '登录' : '注册';
    document.getElementById('authBtn').textContent = state.authMode === 'login' ? '登录' : '注册';
    document.getElementById('authSwitch').innerHTML = state.authMode === 'login'
      ? '还没有账号？<span onclick="ZHS.toggleAuthMode()">立即注册</span>'
      : '已有账号？<span onclick="ZHS.toggleAuthMode()">立即登录</span>';
  };

  ZHS.handleAuth = function () {
    var username = document.getElementById('authUsername').value.trim();
    var password = document.getElementById('authPassword').value.trim();
    if (!username || !password) {
      showToast('请填写用户名和密码');
      return;
    }

    if (state.authMode === 'register') {
      var users = JSON.parse(localStorage.getItem('zhs_users') || '{}');
      if (users[username]) {
        showToast('用户名已存在');
        return;
      }
      users[username] = { password: password, created: Date.now() };
      localStorage.setItem('zhs_users', JSON.stringify(users));
      showToast('注册成功，请登录');
      ZHS.toggleAuthMode();
      return;
    }

    var users = JSON.parse(localStorage.getItem('zhs_users') || '{}');
    if (!users[username] || users[username].password !== password) {
      showToast('用户名或密码错误');
      return;
    }

    state.currentUser = username;
    localStorage.setItem('zhs_current_user', username);
    ZHS.hideAuth();
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = username;
    document.getElementById('userAvatar').textContent = username.charAt(0).toUpperCase();
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    showToast('欢迎回来，' + username);
  };

  ZHS.logout = function () {
    state.currentUser = '智划师';
    localStorage.removeItem('zhs_current_user');
    document.getElementById('userName').textContent = '智划师';
    document.getElementById('userAvatar').textContent = '智';
    document.getElementById('loginBtn').style.display = 'inline-flex';
    document.getElementById('logoutBtn').style.display = 'none';
    showToast('已退出登录');
  };

  // 检查是否已登录（有保存的用户则自动登录）
  var savedUser = localStorage.getItem('zhs_current_user');
  if (savedUser) {
    var users = JSON.parse(localStorage.getItem('zhs_users') || '{}');
    if (users[savedUser]) {
      state.currentUser = savedUser;
      document.getElementById('userName').textContent = savedUser;
      document.getElementById('userAvatar').textContent = savedUser.charAt(0).toUpperCase();
      document.getElementById('loginBtn').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'inline-flex';
    }
  }

  function classifyDemand(text) {
    var t = text.toLowerCase();
    if (/飞机|航班|机票|机场|飞行|出差.*飞|去.*飞/.test(t)) return 'flight';
    if (/学会|学习|掌握|目标|计划|备考|考试|考证/.test(t)) return 'goal';
    if (/调整|修改|移到|改到|提前|延后|取消/.test(t)) return 'modify';
    if (/会议|课|活动|聚餐|约会|面试|比赛/.test(t)) return 'event';
    return 'goal';
  }

  function extractDaysFromDemand(text) {
    var match = text.match(/(\d+)\s*天/);
    if (match) return parseInt(match[1]);
    match = text.match(/(\d+)\s*周/);
    if (match) return parseInt(match[1]) * 7;
    match = text.match(/(\d+)\s*个月/);
    if (match) return parseInt(match[1]) * 30;
    if (/两\s*个月/.test(text)) return 60;
    if (/一\s*个月/.test(text)) return 30;
    return 21;
  }

  /* ====== 自动搜索学习资源 ====== */
  function searchResourcesForDemand(demand) {
    var text = demand.text.toLowerCase();
    var resources = [];

    if (/python|数据分析|data|pandas|numpy/.test(text)) {
      resources = [
        { title: 'Python 官方文档 - Tutorial', source: 'python.org', type: '文档' },
        { title: 'Pandas 入门教程（10分钟上手）', source: 'pandas.pydata.org', type: '教程' },
        { title: 'NumPy 用户指南', source: 'numpy.org', type: '文档' },
        { title: 'Matplotlib 可视化教程', source: 'matplotlib.org', type: '教程' },
        { title: 'Kaggle - Python 数据分析实战', source: 'kaggle.com', type: '实战' },
        { title: 'B站 - Python数据分析从入门到精通', source: 'bilibili.com', type: '视频' }
      ];
    } else if (/英语|四六级|雅思|托福|cet/.test(text)) {
      resources = [
        { title: '新概念英语 1-4 册', source: '外研社', type: '教材' },
        { title: '每日英语听力 APP', source: '每日英语', type: 'App' },
        { title: 'BBC Learning English', source: 'bbc.co.uk', type: '网站' },
        { title: '剑桥雅思真题 4-18', source: 'Cambridge', type: '真题' },
        { title: '墨墨背单词 - 雅思核心词汇', source: 'momo.com', type: 'App' }
      ];
    } else if (/考研|研究生|gre|gmat/.test(text)) {
      resources = [
        { title: '考研数学复习全书', source: '李永乐', type: '教材' },
        { title: '考研英语红宝书', source: '新东方', type: '词汇' },
        { title: '肖秀荣政治精讲精练', source: '肖秀荣', type: '教材' },
        { title: '历年考研真题解析', source: '教育部', type: '真题' }
      ];
    } else if (/前端|html|css|javascript|react|vue/.test(text)) {
      resources = [
        { title: 'MDN Web 文档', source: 'developer.mozilla.org', type: '文档' },
        { title: 'freeCodeCamp 前端课程', source: 'freecodecamp.org', type: '课程' },
        { title: 'Vue.js 官方教程', source: 'vuejs.org', type: '文档' },
        { title: 'React 官方文档', source: 'react.dev', type: '文档' },
        { title: 'CSS-Tricks 布局指南', source: 'css-tricks.com', type: '教程' }
      ];
    } else if (/java|spring|后端/.test(text)) {
      resources = [
        { title: 'Java 核心技术 卷 I', source: 'Cay Horstmann', type: '教材' },
        { title: 'Spring Boot 官方文档', source: 'spring.io', type: '文档' },
        { title: 'LeetCode Java 题解', source: 'leetcode.com', type: '练习' },
        { title: 'B站 - Java 从入门到实战', source: 'bilibili.com', type: '视频' }
      ];
    } else if (/设计|ps|photoshop|ui|figma/.test(text)) {
      resources = [
        { title: 'Figma 官方教程', source: 'figma.com', type: '教程' },
        { title: '设计心理学', source: 'Don Norman', type: '书籍' },
        { title: 'Dribbble 设计灵感', source: 'dribbble.com', type: '灵感' },
        { title: '站酷 - UI设计入门', source: 'zcool.com.cn', type: '教程' }
      ];
    } else {
      resources = [
        { title: '相关领域入门指南', source: 'zhihu.com', type: '文章' },
        { title: 'B站 系统教程合集', source: 'bilibili.com', type: '视频' },
        { title: 'Coursera 在线课程', source: 'coursera.org', type: '课程' },
        { title: 'GitHub 开源项目参考', source: 'github.com', type: '项目' }
      ];
    }

    return resources;
  }

  /* ====== 提取航班信息 ====== */
  function extractFlightInfo(text) {
    var info = { airline: '', flightNo: '', airport: '', time: '', date: '' };
    // 提取航班号
    var flightMatch = text.match(/([A-Z]{2}\d{3,4})/);
    if (flightMatch) info.flightNo = flightMatch[1];
    // 提取时间
    var timeMatch = text.match(/(\d{1,2})[点时:：](\d{0,2})/);
    if (timeMatch) info.time = timeMatch[1] + ':' + (timeMatch[2] || '00');
    // 提取机场/目的地
    var airportKeywords = ['首都机场', '大兴机场', '浦东机场', '虹桥机场', '白云机场', '宝安机场', '天府机场', '双流机场', '萧山机场', '长乐机场'];
    for (var i = 0; i < airportKeywords.length; i++) {
      if (text.includes(airportKeywords[i])) {
        info.airport = airportKeywords[i];
        break;
      }
    }
    // 提取日期关键词
    if (/明天/.test(text)) info.date = '明天';
    else if (/后天/.test(text)) info.date = '后天';
    else if (/大后天/.test(text)) info.date = '大后天';
    else if (/下周/.test(text)) info.date = '下周';
    else info.date = '今天';
    return info;
  }

  /* ====== 搜索航班/出行资源 ====== */
  function searchFlightResources(demand) {
    var info = extractFlightInfo(demand.text);
    var resources = [];
    var airport = info.airport || '目标机场';
    var city = airport.replace('机场', '');
    resources.push({ title: '高德地图：当前位置 → ' + airport + ' 路线', source: 'amap.com', type: '导航' });
    resources.push({ title: airport + ' 航站楼/登机口分布图', source: airport + '官网', type: '信息' });
    resources.push({ title: airport + ' 值机/安检/登机全流程指南', source: '航旅纵横', type: '攻略' });
    if (info.flightNo) {
      resources.push({ title: info.flightNo + ' 航班实时动态查询', source: '飞常准', type: '动态' });
    }
    resources.push({ title: city + ' 机场大巴/地铁/出租车乘车指南', source: '高德地图', type: '交通' });
    return resources;
  }

  function generateQuestionsForDemand(demand) {
    var questions = [];
    var type = demand.type;
    var text = demand.text;

    if (type === 'goal') {
      questions.push({ ai: '关于「' + text.substring(0, 18) + '...」，你目前有基础吗？', key: 'level' });
      questions.push({ ai: '每天能投入多少时间？', key: 'hours' });
      questions.push({ ai: '偏好哪个时段学习？', key: 'period' });
      if (/项目|作品|简历/.test(text)) {
        questions.push({ ai: '希望最终产出什么？', key: 'outcome' });
      }
    } else if (type === 'flight') {
      var info = extractFlightInfo(text);
      var hasTime = info.time;
      var hasAirport = info.airport;
      var hasFlightNo = info.flightNo;

      questions.push({ ai: '你当前所在的位置是哪里？（如：XX区XX路）', key: 'departLocation' });
      if (!hasAirport) {
        questions.push({ ai: '目的地是哪个机场？', key: 'airport' });
      }
      if (!hasFlightNo) {
        questions.push({ ai: '航班号是多少？', key: 'flightNo' });
      }
      if (!hasTime) {
        questions.push({ ai: '航班大概几点起飞？', key: 'flightTime' });
      }
      questions.push({ ai: '你打算怎么去机场？（地铁/打车/自驾/机场大巴）', key: 'transport' });
      questions.push({ ai: '需要提前多久到机场办理手续？', key: 'arriveEarly' });
    } else if (type === 'event') {
      var hasTime = /\d{1,2}[点时:：]/.test(text);
      var hasDuration = /小时|分钟|半小时/.test(text);
      if (!hasTime) {
        questions.push({ ai: '事件大概在什么时间？', key: 'timePeriod' });
      }
      if (!hasDuration) {
        questions.push({ ai: '预计持续多久？', key: 'duration' });
      }
      questions.push({ ai: '每周固定还是一次性？', key: 'frequency' });
    } else if (type === 'modify') {
      questions.push({ ai: '具体想怎么调整？', key: 'adjustType' });
    }

    return questions;
  }

  /* ====== 对话渲染 ====== */
  function addAiMessage(text, key) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg ai';
    msgDiv.innerHTML = '<div class="chat-bubble"><span class="sender">智划师</span>' + text + '</div>';
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;

    state.waitingForAnswer = true;
    state.currentQuestionKey = key;
    document.getElementById('chatInputBar').style.display = 'flex';
    document.getElementById('chatInput').focus();
  }

  function addUserMessage(text) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg user';
    msgDiv.innerHTML = '<div class="chat-bubble"><span class="sender">你</span>' + text + '</div>';
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function addSystemMessage(text) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg ai';
    msgDiv.innerHTML = '<div class="chat-bubble"><span class="sender">智划师</span>' + text + '</div>';
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  /* ====== 运行对话队列 ====== */
  function runDialogQueue() {
    if (state.dialogIndex >= state.dialogQueue.length) {
      finishCollecting();
      return;
    }
    var step = state.dialogQueue[state.dialogIndex];
    setTimeout(function () {
      if (step.ai.startsWith('---')) {
        // 分隔线消息：直接显示，不等待回答
        addSystemMessage(step.ai);
        state.dialogIndex++;
        runDialogQueue();
      } else if (step.isSystem) {
        // 系统消息（如"信息收集完毕"）：直接显示，不等待回答，继续队列
        addSystemMessage(step.ai);
        state.dialogIndex++;
        runDialogQueue();
      } else {
        // 真正的问题：等待用户回答
        addAiMessage(step.ai, step.key);
        state.dialogIndex++;
      }
    }, step.delay || 500);
  }

  /* ====== 用户提交回答 ====== */
  ZHS.submitAnswer = function () {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    if (!text || !state.waitingForAnswer) return;

    state.waitingForAnswer = false;
    document.getElementById('chatInputBar').style.display = 'none';
    input.value = '';

    var currentStep = state.dialogQueue[state.dialogIndex - 1];
    if (currentStep && currentStep.demandId) {
      var demand = state.demands.find(function (d) { return d.id === currentStep.demandId; });
      if (demand) {
        demand.answers[currentStep.key] = text;
      }
    }

    addUserMessage(text);
    setTimeout(runDialogQueue, 300);
  };

  /* ====== 提交需求 ====== */
  ZHS.submitDemand = function () {
    var input = document.getElementById('demandInput');
    var text = input.value.trim();
    if (!text) return;

    // 如果当前正在收集信息，提示用户先完成对话
    if (state.phase !== 'idle') {
      addSystemMessage('⏳ 当前正在收集信息中，请先回答完当前问题，再提交新需求。');
      return;
    }

    var type = classifyDemand(text);
    var demand = {
      id: ++demandIdCounter,
      type: type,
      text: text,
      days: extractDaysFromDemand(text),
      answers: {},
      questions: []
    };

    state.demands.push(demand);
    renderDemandList();
    input.value = '';

    addUserMessage(text);
    setTimeout(function () {
      var typeNames = { goal: '学习目标', event: '日程事件', modify: '调整需求', flight: '航班出行' };
      var daysText = type === 'flight' ? '当日' : demand.days + ' 天';
      addSystemMessage('收到' + typeNames[type] + '「' + text.substring(0, 20) + (text.length > 20 ? '...' : '') + '」，约 <strong>' + daysText + '</strong>。');

      // 如果当前没有正在进行的对话，自动开始收集信息
      if (state.phase === 'idle') {
        setTimeout(function () {
          ZHS.generateSchedule();
        }, 600);
      }
    }, 200);
  };

  /* ====== 计算航班出发时间 ====== */
  function calcFlightSchedule(demand, dayIndex) {
    var answers = demand.answers || {};
    var info = extractFlightInfo(demand.text);
    var flightTime = info.time || answers.flightTime || '14:00';
    var transport = answers.transport || '地铁';
    var arriveEarly = answers.arriveEarly || '2小时';
    var airport = answers.airport || info.airport || '机场';
    var flightNo = answers.flightNo || info.flightNo || '';

    // 解析起飞时间
    var ftParts = flightTime.split(':');
    var ftHour = parseInt(ftParts[0]);
    var ftMin = parseInt(ftParts[1] || 0);

    // 根据交通方式估算路上时间
    var travelMinutes = 60; // 默认1小时
    if (/地铁/.test(transport)) travelMinutes = 50;
    else if (/打车|出租车|滴滴/.test(transport)) travelMinutes = 40;
    else if (/自驾/.test(transport)) travelMinutes = 45;
    else if (/大巴|机场大巴/.test(transport)) travelMinutes = 70;

    // 解析提前到达时间
    var earlyMatch = arriveEarly.match(/(\d+)/);
    var earlyMinutes = earlyMatch ? parseInt(earlyMatch[1]) * 60 : 120;

    // 计算各节点时间
    var arriveAirportHour = ftHour;
    var arriveAirportMin = ftMin - earlyMinutes;
    while (arriveAirportMin < 0) {
      arriveAirportMin += 60;
      arriveAirportHour -= 1;
    }

    var departHomeMin = arriveAirportMin - travelMinutes;
    var departHomeHour = arriveAirportHour;
    while (departHomeMin < 0) {
      departHomeMin += 60;
      departHomeHour -= 1;
    }

    // 格式化时间
    function fmt(h, m) {
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    var blocks = [];

    // 1. 从家出发
    var departHomeTime = fmt(departHomeHour, departHomeMin);
    var arriveAirportTime = fmt(arriveAirportHour, arriveAirportMin);
    blocks.push({
      start: departHomeTime,
      end: arriveAirportTime,
      title: '🚗 从家出发前往' + airport,
      detail: '乘坐' + transport + '，预计' + travelMinutes + '分钟到达' + airport,
      type: 'event',
      source: '高德地图 · ' + transport + '路线'
    });

    // 2. 到达机场，办理值机
    var checkinEndHour = arriveAirportHour;
    var checkinEndMin = arriveAirportMin + 40;
    while (checkinEndMin >= 60) {
      checkinEndMin -= 60;
      checkinEndHour += 1;
    }
    blocks.push({
      start: arriveAirportTime,
      end: fmt(checkinEndHour, checkinEndMin),
      title: '🛫 到达' + airport + '，办理值机/托运/安检',
      detail: '提前' + (earlyMinutes / 60) + '小时到达，办理登机手续',
      type: 'event',
      source: airport + '官网 · 值机指南'
    });

    // 3. 候机
    var boardHour = checkinEndHour;
    var boardMin = checkinEndMin;
    var boardEndHour = ftHour;
    var boardEndMin = ftMin - 15;
    while (boardEndMin < 0) {
      boardEndMin += 60;
      boardEndHour -= 1;
    }
    if (boardEndHour > boardHour || (boardEndHour === boardHour && boardEndMin > boardMin)) {
      blocks.push({
        start: fmt(boardHour, boardMin),
        end: fmt(boardEndHour, boardEndMin),
        title: '☕ 候机休息',
        detail: '前往登机口等候，可处理邮件或休息',
        type: 'event',
        source: airport + ' · 登机口信息'
      });
    }

    // 4. 登机起飞
    var gateCloseMin = ftMin + 15;
    var gateCloseHour = ftHour;
    while (gateCloseMin >= 60) {
      gateCloseMin -= 60;
      gateCloseHour += 1;
    }
    blocks.push({
      start: flightTime,
      end: fmt(gateCloseHour, gateCloseMin),
      title: '✈️ ' + (flightNo ? flightNo + ' ' : '') + '航班起飞',
      detail: '目的地：' + airport + '，请留意登机广播',
      type: 'event',
      source: flightNo ? '飞常准 · ' + flightNo + '动态' : '航旅纵横'
    });

    return blocks;
  }

  function renderDemandList() {
    var list = document.getElementById('demandList');
    if (state.demands.length === 0) {
      list.innerHTML = '';
      return;
    }
    var html = '';
    state.demands.forEach(function (d) {
      var typeNames = { goal: '目标', event: '事件', modify: '调整', flight: '航班' };
      var typeColors = { goal: 'goal', event: 'event', modify: 'modify', flight: 'goal' };
      html += '<div class="demand-tag">';
      html += '<span class="type ' + typeColors[d.type] + '">' + typeNames[d.type] + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.text + '</span>';
      html += '<span style="font-size:0.65rem;color:var(--muted)">' + (d.type === 'flight' ? '当日' : d.days + '天') + '</span>';
      html += '<span class="del" onclick="ZHS.removeDemand(' + d.id + ')">✕</span>';
      html += '</div>';
    });
    list.innerHTML = html;
  }

  ZHS.removeDemand = function (id) {
    state.demands = state.demands.filter(function (d) { return d.id !== id; });
    renderDemandList();
    if (state.demands.length === 0) {
      document.getElementById('generateBtn').style.display = 'none';
    }
  };

  /* ====== 生成总行程 ====== */
  ZHS.generateSchedule = function () {
    if (state.demands.length === 0) return;
    if (state.phase !== 'idle') return;

    // 如果已有行程，只收集新需求的信息，然后更新
    if (state.schedule) {
      var newDemands = state.demands.filter(function (d) {
        return !d.questions || d.questions.length === 0;
      });

      if (newDemands.length === 0) {
        // 没有新需求需要收集，直接重新生成
        state.phase = 'generating';
        state.schedule = buildIntegratedSchedule();
        state.currentDay = 0;
        state.currentWeek = 0;
        state.phase = 'ready';
        renderSchedule();
        addSystemMessage('🔄 总行程表已更新！整合 <strong>' + state.demands.length + ' 个需求</strong>。');
        setTimeout(function () {
          addSystemMessage('可继续提交新需求，AI 会更新总行程。');
        }, 400);
        state.phase = 'idle';
        return;
      }

      // 有新需求，进入增量收集模式
      state.phase = 'collecting';
      state.dialogQueue = [];
      state.dialogIndex = 0;

      // 只为新需求搜索资源
      newDemands.forEach(function (demand) {
        if (demand.type === 'goal') {
          var resources = searchResourcesForDemand(demand);
          demand.resources = resources;
        } else if (demand.type === 'flight') {
          var resources = searchFlightResources(demand);
          demand.resources = resources;
        }
      });

      // 构建只针对新需求的对话队列
      newDemands.forEach(function (demand) {
        if (demand.type === 'goal' && demand.resources && demand.resources.length > 0) {
          var searchMsg = '🔍 正在搜索「' + demand.text.substring(0, 20) + '」相关学习资源...';
          state.dialogQueue.push({ ai: searchMsg, delay: 400, isSystem: true });
          var foundMsg = '找到 <strong>' + demand.resources.length + ' 个</strong>推荐资源：';
          state.dialogQueue.push({ ai: foundMsg, delay: 600, isSystem: true });
          demand.resources.forEach(function (res, idx) {
            var resMsg = (idx + 1) + '. <strong>' + res.title + '</strong> <span style="color:var(--muted);font-size:0.78rem">[' + res.type + ' · ' + res.source + ']</span>';
            state.dialogQueue.push({ ai: resMsg, delay: 150, isSystem: true });
          });
        }

        if (demand.type === 'flight' && demand.resources && demand.resources.length > 0) {
          var flightInfo = extractFlightInfo(demand.text);
          var searchMsg = '🔍 正在搜索「' + (flightInfo.airport || '目标机场') + '」出行信息...';
          state.dialogQueue.push({ ai: searchMsg, delay: 400, isSystem: true });
          var foundMsg = '找到 <strong>' + demand.resources.length + ' 个</strong>出行参考：';
          state.dialogQueue.push({ ai: foundMsg, delay: 600, isSystem: true });
          demand.resources.forEach(function (res, idx) {
            var resMsg = (idx + 1) + '. <strong>' + res.title + '</strong> <span style="color:var(--muted);font-size:0.78rem">[' + res.type + ' · ' + res.source + ']</span>';
            state.dialogQueue.push({ ai: resMsg, delay: 150, isSystem: true });
          });
        }

        var questions = generateQuestionsForDemand(demand);
        demand.questions = questions;
        if (questions.length > 0) {
          state.dialogQueue.push({ ai: '--- 新需求 #' + demand.id + '：' + demand.text.substring(0, 12) + '...---', delay: 300 });
          questions.forEach(function (q) {
            state.dialogQueue.push(Object.assign({}, q, { demandId: demand.id }));
          });
        }
      });

      state.dialogQueue.push({ ai: '信息收集完毕！正在更新总行程表...', delay: 800, isSystem: true });
      addSystemMessage('检测到新需求，开始收集信息。');
      setTimeout(runDialogQueue, 400);
      return;
    }

    state.phase = 'collecting';
    state.dialogQueue = [];
    state.dialogIndex = 0;
    chatArea.innerHTML = '';

    // 先为每个需求自动搜索资源
    state.demands.forEach(function (demand) {
      if (demand.type === 'goal') {
        var resources = searchResourcesForDemand(demand);
        demand.resources = resources;
      } else if (demand.type === 'flight') {
        var resources = searchFlightResources(demand);
        demand.resources = resources;
      }
    });

    // 构建对话队列：搜索展示 -> 提问
    state.demands.forEach(function (demand) {
      // 搜索资源展示（系统消息，不等待回答）
      if (demand.type === 'goal' && demand.resources && demand.resources.length > 0) {
        var searchMsg = '🔍 正在搜索「' + demand.text.substring(0, 20) + '」相关学习资源...';
        state.dialogQueue.push({ ai: searchMsg, delay: 400, isSystem: true });

        var foundMsg = '找到 <strong>' + demand.resources.length + ' 个</strong>推荐资源：';
        state.dialogQueue.push({ ai: foundMsg, delay: 600, isSystem: true });

        demand.resources.forEach(function (res, idx) {
          var resMsg = (idx + 1) + '. <strong>' + res.title + '</strong> <span style="color:var(--muted);font-size:0.78rem">[' + res.type + ' · ' + res.source + ']</span>';
          state.dialogQueue.push({ ai: resMsg, delay: 150, isSystem: true });
        });
      }

      // 航班出行资源搜索展示
      if (demand.type === 'flight' && demand.resources && demand.resources.length > 0) {
        var flightInfo = extractFlightInfo(demand.text);
        var searchMsg = '🔍 正在搜索「' + (flightInfo.airport || '目标机场') + '」出行信息...';
        state.dialogQueue.push({ ai: searchMsg, delay: 400, isSystem: true });

        var foundMsg = '找到 <strong>' + demand.resources.length + ' 个</strong>出行参考：';
        state.dialogQueue.push({ ai: foundMsg, delay: 600, isSystem: true });

        demand.resources.forEach(function (res, idx) {
          var resMsg = (idx + 1) + '. <strong>' + res.title + '</strong> <span style="color:var(--muted);font-size:0.78rem">[' + res.type + ' · ' + res.source + ']</span>';
          state.dialogQueue.push({ ai: resMsg, delay: 150, isSystem: true });
        });
      }

      // 提问
      var questions = generateQuestionsForDemand(demand);
      demand.questions = questions;
      if (questions.length > 0) {
        state.dialogQueue.push({ ai: '--- 需求 #' + demand.id + '：' + demand.text.substring(0, 12) + '...（' + demand.days + '天）---', delay: 300 });
        questions.forEach(function (q) {
          state.dialogQueue.push(Object.assign({}, q, { demandId: demand.id }));
        });
      }
    });

    state.dialogQueue.push({ ai: '信息收集完毕！正在整合生成总行程表...', delay: 800, isSystem: true });

    addSystemMessage('开始收集每个需求的信息。');
    setTimeout(runDialogQueue, 400);
  };

  function finishCollecting() {
    var isUpdate = !!state.schedule; // 是否增量更新
    state.phase = 'generating';
    state.schedule = buildIntegratedSchedule();
    if (!isUpdate) {
      state.currentDay = 0;
      state.currentWeek = 0;
    }
    state.phase = 'ready';

    renderSchedule();
    document.getElementById('totalProgress').style.display = 'block';
    document.getElementById('weekNav').style.display = 'flex';

    var total = calcTotalProgress();
    if (isUpdate) {
      addSystemMessage('🔄 总行程表已更新！整合 <strong>' + state.demands.length + ' 个需求</strong>，共 ' + state.schedule.length + ' 天，' + total.total + ' 个任务。');
    } else {
      addSystemMessage('✅ 总行程表已生成！整合 <strong>' + state.demands.length + ' 个需求</strong>，共 ' + state.schedule.length + ' 天，' + total.total + ' 个任务。');
    }

    setTimeout(function () {
      addSystemMessage('可继续提交新需求，AI 会更新总行程。');
    }, 600);

    setTimeout(function () {
      if (state.reminderOn) showReminder(state.schedule[0]);
    }, 1500);

    state.phase = 'idle';
  }

  /* ====== 构建整合后的总行程（只包含目标任务和事件） ====== */
  function buildIntegratedSchedule() {
    var baseEvents = {
      '周一': [
        { start: '08:00', end: '12:00', title: '上课', detail: '已有日程', type: 'event' },
        { start: '14:00', end: '16:00', title: '英语课', detail: '已有日程', type: 'event' }
      ],
      '周二': [{ start: '10:00', end: '12:00', title: '组会', detail: '已有日程', type: 'event' }],
      '周三': [{ start: '08:00', end: '10:00', title: '实验课', detail: '已有日程', type: 'event' }],
      '周四': [{ start: '08:00', end: '12:00', title: '上课', detail: '已有日程', type: 'event' }],
      '周五': [
        { start: '08:00', end: '12:00', title: '上课', detail: '已有日程', type: 'event' },
        { start: '14:00', end: '16:00', title: '体育课', detail: '已有日程', type: 'event' }
      ],
      '周六': [],
      '周日': []
    };

    var goals = state.demands.filter(function (d) { return d.type === 'goal'; });
    var events = state.demands.filter(function (d) { return d.type === 'event'; });
    var flights = state.demands.filter(function (d) { return d.type === 'flight'; });

    var maxDays = 21;
    state.demands.forEach(function (d) {
      if (d.days > maxDays) maxDays = d.days;
    });
    if (maxDays > 60) maxDays = 60;

    var weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var schedule = [];
    var startDate = new Date(2026, 5, 22); // 2026-06-22

    // 计算航班目标日期索引
    var flightDayMap = {};
    flights.forEach(function (f) {
      var info = extractFlightInfo(f.text);
      var dayOffset = 0;
      if (info.date === '明天') dayOffset = 1;
      else if (info.date === '后天') dayOffset = 2;
      else if (info.date === '大后天') dayOffset = 3;
      else if (info.date === '下周') dayOffset = 7;
      flightDayMap[f.id] = dayOffset;
    });

    for (var i = 0; i < maxDays; i++) {
      var weekday = weekDays[i % 7];
      var weekNum = Math.floor(i / 7) + 1;
      var blocks = [];

      var fixed = baseEvents[weekday] || [];
      fixed.forEach(function (e) { blocks.push(Object.assign({}, e)); });

      // 如果今天有航班事件，插入航班日程块（优先于学习任务）
      flights.forEach(function (f) {
        if (flightDayMap[f.id] === i) {
          var flightBlocks = calcFlightSchedule(f, i);
          flightBlocks.forEach(function (fb) { blocks.push(fb); });
        }
      });

      var learnStart = 19;
      goals.forEach(function (goal, gi) {
        var period = goal.answers.period || '晚上';
        var startH = period === '晚上' ? 19 : (period === '上午' ? 8 : 14);
        var offset = gi * 2;
        var s1 = startH + offset;
        var s2 = s1 + 1;

        var task = generateTaskForGoal(goal, i, gi);
        if (task) {
          blocks.push({
            start: s1 + ':00',
            end: s1 + ':50',
            title: task.title,
            detail: task.detail,
            type: 'learning',
            source: task.source || goal.text.substring(0, 15),
            done: false,
            goalId: goal.id
          });
          if (task.subtask) {
            blocks.push({
              start: s2 + ':00',
              end: s2 + ':50',
              title: task.subtask.title,
              detail: task.subtask.detail,
              type: 'learning',
              source: task.subtask.source || goal.text.substring(0, 15),
              done: false,
              goalId: goal.id
            });
          }
        }
      });

      events.forEach(function (evt) {
        var freq = evt.answers.frequency || '每周固定';
        if (freq === '每周固定' || (freq === '仅本周' && i < 7)) {
          var evtWeekday = extractWeekday(evt.text);
          if (evtWeekday === weekday) {
            var timeInfo = extractTime(evt.text);
            blocks.push({
              start: timeInfo.start,
              end: timeInfo.end,
              title: evt.text.replace(/\d{1,2}[点时:：]\d{0,2}/g, '').trim() || '新事件',
              detail: '用户添加',
              type: 'event'
            });
          }
        }
      });

      blocks.sort(function (a, b) { return parseTime(a.start) - parseTime(b.start); });

      var currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      var month = currentDate.getMonth() + 1;
      var date = currentDate.getDate();

      schedule.push({
        label: '第 ' + (i + 1) + ' 天',
        weekday: weekday,
        theme: goals.length > 0 ? goals[0].text.substring(0, 20) + '...' : '总行程',
        week: weekNum,
        blocks: blocks,
        dateLabel: month + '月' + date + '日',
        dateStr: month + '/' + date
      });
    }

    return schedule;
  }

  function generateTaskForGoal(goal, dayIndex, goalIndex) {
    // 如果有搜索到的资源，用真实资源名称填充任务
    var resources = goal.resources || [];
    var hasResources = resources.length > 0;

    var texts = [
      { title: '学习核心概念', detail: '阅读教材/观看视频，理解基础知识点', source: '学习资源' },
      { title: '完成练习题', detail: '做相关练习题巩固所学内容', source: '练习题库' },
      { title: '实践项目', detail: '动手实践，完成一个小项目或案例', source: '项目实战' },
      { title: '复习总结', detail: '回顾本周学习内容，整理笔记', source: '复习清单' },
      { title: '进阶学习', detail: '深入学习进阶内容，挑战难题', source: '进阶课程' },
      { title: '综合应用', detail: '将所学知识综合应用到实际场景中', source: '综合实践' },
      { title: '成果产出', detail: '完成最终成果，如项目、报告等', source: '成果产出' }
    ];

    var idx = dayIndex % texts.length;
    var task = Object.assign({}, texts[idx]);

    // 用搜索到的真实资源替换通用描述
    if (hasResources) {
      var resIdx = dayIndex % resources.length;
      var res = resources[resIdx];
      task.source = res.title + ' · ' + res.source;

      // 根据资源类型定制详情
      if (res.type === '视频') {
        task.detail = '观看「' + res.title + '」，完成对应章节学习笔记';
      } else if (res.type === '文档' || res.type === '教程') {
        task.detail = '阅读「' + res.title + '」，理解核心概念并做笔记';
      } else if (res.type === '实战' || res.type === '项目') {
        task.detail = '跟随「' + res.title + '」完成实战练习';
      } else if (res.type === '真题' || res.type === '练习') {
        task.detail = '完成「' + res.title + '」对应章节练习';
      } else if (res.type === 'App') {
        task.detail = '使用「' + res.title + '」进行每日练习';
      } else {
        task.detail = '学习「' + res.title + '」，掌握相关知识点';
      }
    }

    task.title = goal.text.substring(0, 10) + ' - ' + task.title;

    var subtask = null;
    if (dayIndex % 3 === 0 && dayIndex > 0) {
      var checkRes = hasResources ? resources[(dayIndex + 1) % resources.length] : null;
      subtask = {
        title: '检查进度并调整',
        detail: checkRes ? '回顾「' + checkRes.title + '」学习情况，根据实际进度调整后续计划' : '回顾完成情况，根据实际进度调整后续计划',
        source: checkRes ? checkRes.source : '系统反馈'
      };
    }

    return { title: task.title, detail: task.detail, source: task.source, subtask: subtask };
  }

  function extractWeekday(text) {
    var days = { '周一': '周一', '周二': '周二', '周三': '周三', '周四': '周四', '周五': '周五', '周六': '周六', '周日': '周日' };
    for (var d in days) {
      if (text.includes(d)) return days[d];
    }
    return '周一';
  }

  function extractTime(text) {
    var match = text.match(/(\d{1,2})[点时:：](\d{0,2})/);
    var h = match ? parseInt(match[1]) : 14;
    var start = (h < 10 ? '0' : '') + h + ':00';
    var endH = h + 1;
    var end = (endH < 10 ? '0' : '') + endH + ':00';
    return { start: start, end: end };
  }

  function parseTime(s) {
    if (!s) return 0;
    var p = s.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  }

  function calcTotalProgress() {
    if (!state.schedule) return { done: 0, total: 0 };
    var done = 0, total = 0;
    for (var i = 0; i < state.schedule.length; i++) {
      var blocks = state.schedule[i].blocks;
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].type === 'learning') {
          total++;
          if (blocks[j].done) done++;
        }
      }
    }
    return { done: done, total: total };
  }

  function updateTotalProgress() {
    var p = calcTotalProgress();
    document.getElementById('totalNum').textContent = p.done + '/' + p.total;
    var pct = p.total > 0 ? (p.done / p.total * 100) : 0;
    document.getElementById('totalFill').style.width = pct + '%';
  }

  function checkDayComplete(dayIndex) {
    var day = state.schedule[dayIndex];
    if (!day) return false;
    var learningBlocks = day.blocks.filter(function (b) { return b.type === 'learning'; });
    if (learningBlocks.length === 0) return false;
    return learningBlocks.every(function (b) { return b.done; });
  }

  /* ====== 周切换 ====== */
  ZHS.prevWeek = function () {
    if (state.currentWeek > 0) {
      state.currentWeek--;
      state.currentDay = state.currentWeek * 7;
      renderSchedule();
    }
  };

  ZHS.nextWeek = function () {
    var totalWeeks = Math.ceil(state.schedule.length / 7);
    if (state.currentWeek < totalWeeks - 1) {
      state.currentWeek++;
      state.currentDay = state.currentWeek * 7;
      renderSchedule();
    }
  };

  function renderSchedule() {
    var container = document.getElementById('scheduleContainer');
    var tabsEl = document.getElementById('dayNav');
    var titleEl = document.getElementById('mainTitle');
    var weekLabel = document.getElementById('weekLabel');
    var prevBtn = document.getElementById('prevWeekBtn');
    var nextBtn = document.getElementById('nextWeekBtn');

    if (!state.schedule) {
      container.innerHTML = '<div class="empty-state"><span class="icon">📅</span><p>在左侧提交需求<br>AI 收集信息并生成整合后的总行程表</p></div>';
      tabsEl.innerHTML = '';
      titleEl.textContent = '总行程规划';
      document.getElementById('weekNav').style.display = 'none';
      return;
    }

    titleEl.textContent = '整合总行程 · 共 ' + state.schedule.length + ' 天';

    var totalWeeks = Math.ceil(state.schedule.length / 7);
    weekLabel.textContent = '第' + (state.currentWeek + 1) + '周 / 共' + totalWeeks + '周';
    prevBtn.disabled = state.currentWeek === 0;
    nextBtn.disabled = state.currentWeek >= totalWeeks - 1;

    // 只渲染当前周的7天
    var weekStart = state.currentWeek * 7;
    var weekEnd = Math.min(weekStart + 7, state.schedule.length);

    var tabsHtml = '';
    for (var i = weekStart; i < weekEnd; i++) {
      var day = state.schedule[i];
      var isComplete = checkDayComplete(i);
      var isActive = i === state.currentDay;
      var cls = 'day-tab';
      if (isActive) cls += ' active';
      if (isComplete) cls += ' done-day';

      tabsHtml += '<button class="' + cls + '" onclick="ZHS.switchDay(' + i + ')">';
      tabsHtml += day.dateLabel;
      tabsHtml += '<span class="day-date">' + day.weekday + '</span>';
      if (isComplete) tabsHtml += '<span style="font-size:0.6rem"> ✓</span>';
      tabsHtml += '</button>';
    }
    tabsEl.innerHTML = tabsHtml;

    var currentDayData = state.schedule[state.currentDay];
    var learningBlocks = currentDayData.blocks.filter(function (b) { return b.type === 'learning'; });
    var completedCount = learningBlocks.filter(function (b) { return b.done; }).length;
    var isDayComplete = checkDayComplete(state.currentDay);

    var html = '';

    if (isDayComplete && state.autoNextOn && state.currentDay < state.schedule.length - 1) {
      html += '<div class="day-complete-banner">';
      html += '<p>🎉 ' + currentDayData.dateLabel + ' ' + currentDayData.weekday + ' 全部完成！</p>';
      html += '<button onclick="ZHS.goNextDay()">下一天 →</button>';
      html += '</div>';
    } else if (isDayComplete) {
      html += '<div class="day-complete-banner">';
      html += '<p>🎉 恭喜！全部完成！</p>';
      html += '</div>';
    }

    // 日期头部 - 使用日期+周X格式
    var statusBadgeCls = isDayComplete ? 'completed' : (completedCount > 0 ? 'in-progress' : 'upcoming');
    var statusBadgeText = isDayComplete ? '已完成' : (completedCount > 0 ? '进行中' : '未开始');
    html += '<div class="day-header">';
    html += '<div class="day-num">' + currentDayData.dateLabel + '</div>';
    html += '<div class="day-info">';
    html += '<div class="day-title">' + currentDayData.weekday + ' · 第' + currentDayData.week + '周</div>';
    html += '<div class="day-meta">' + currentDayData.theme + '</div>';
    html += '</div>';
    html += '<div style="text-align:right">';
    html += '<span class="day-status-badge ' + statusBadgeCls + '">' + statusBadgeText + '</span>';
    html += '<div style="margin-top:0.3rem;font-size:0.78rem;color:var(--muted)"><span class="mono" style="color:var(--accent);font-weight:700">' + completedCount + '/' + learningBlocks.length + '</span> 任务</div>';
    html += '</div></div>';

    // 任务卡片网格
    html += '<div class="tasks-grid">';
    for (var b = 0; b < currentDayData.blocks.length; b++) {
      var block = currentDayData.blocks[b];
      var cardCls = 'task-card ' + block.type;
      if (block.done) cardCls += ' done';
      html += '<div class="' + cardCls + '">';

      // 勾选框
      if (block.type === 'learning') {
        html += '<div class="task-card-check' + (block.done ? ' done' : '') + '" onclick="ZHS.toggleTask(' + state.currentDay + ',' + b + ')">' + (block.done ? '✓' : '') + '</div>';
      }

      // 时间和类型标签
      html += '<div class="task-card-header">';
      html += '<div class="task-card-time">' + block.start + '<span class="time-sep">→</span>' + block.end + '</div>';
      html += '</div>';

      // 标题
      html += '<div class="task-card-title">' + block.title + '</div>';

      // 详情
      if (block.detail) html += '<div class="task-card-detail">' + block.detail + '</div>';

      // 来源
      if (block.source) html += '<div class="task-card-source">' + block.source + '</div>';

      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
    updateTotalProgress();
  }

  ZHS.switchDay = function (index) {
    if (index < 0 || index >= state.schedule.length) return;
    state.currentDay = index;
    state.currentWeek = Math.floor(index / 7);
    renderSchedule();

    if (state.reminderOn && !state.reminderShown[index]) {
      var day = state.schedule[index];
      var learningBlocks = day.blocks.filter(function (b) { return b.type === 'learning'; });
      var incomplete = learningBlocks.filter(function (b) { return !b.done; });
      if (incomplete.length > 0) {
        setTimeout(function () { showReminder(day); }, 300);
        state.reminderShown[index] = true;
      }
    }
  };

  ZHS.goNextDay = function () {
    if (state.currentDay < state.schedule.length - 1) {
      state.currentDay++;
      state.currentWeek = Math.floor(state.currentDay / 7);
      renderSchedule();
      showToast('已跳转到 ' + state.schedule[state.currentDay].dateLabel);
      if (state.reminderOn) {
        setTimeout(function () {
          showReminder(state.schedule[state.currentDay]);
          state.reminderShown[state.currentDay] = true;
        }, 500);
      }
    }
  };

  ZHS.toggleTask = function (dayIndex, blockIdx) {
    var block = state.schedule[dayIndex].blocks[blockIdx];
    if (!block || block.type !== 'learning') return;

    block.done = !block.done;
    renderSchedule();

    if (block.done) {
      showToast('✓ ' + block.title + ' 已完成');
    }

    if (checkDayComplete(dayIndex)) {
      var day = state.schedule[dayIndex];
      addSystemMessage('🎉 太棒了！' + day.dateLabel + ' ' + day.weekday + ' 的所有任务已完成！');

      if (state.autoNextOn && dayIndex < state.schedule.length - 1) {
        setTimeout(function () {
          if (state.currentDay === dayIndex) {
            ZHS.goNextDay();
          }
        }, 3000);
      }
    }
  };

  function showReminder(day) {
    var learningBlocks = day.blocks.filter(function (b) { return b.type === 'learning'; });
    var incomplete = learningBlocks.filter(function (b) { return !b.done; });
    if (incomplete.length === 0) return;

    var overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';
    overlay.id = 'reminderOverlay';

    var tasksList = '';
    for (var i = 0; i < Math.min(incomplete.length, 3); i++) {
      tasksList += '<div class="task-item"><span class="time">' + incomplete[i].start + '</span>' + incomplete[i].title + '</div>';
    }
    if (incomplete.length > 3) {
      tasksList += '<div style="padding:0.2rem 0;font-size:0.78rem;color:var(--muted)">...还有 ' + (incomplete.length - 3) + ' 项</div>';
    }

    overlay.innerHTML =
      '<div class="reminder-modal">' +
        '<h3>📋 ' + day.dateLabel + ' ' + day.weekday + ' 任务提醒</h3>' +
        '<div style="margin-bottom:0.6rem;font-size:0.82rem;color:var(--muted)">' + day.theme + '</div>' +
        tasksList +
        '<div class="actions">' +
          '<button class="btn btn-primary" onclick="ZHS.closeReminder()">知道了</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) ZHS.closeReminder();
    });
  }

  ZHS.closeReminder = function () {
    var overlay = document.getElementById('reminderOverlay');
    if (overlay) overlay.remove();
  };

  ZHS.handleImageUpload = function (input) {
    var file = input.files[0];
    if (!file) return;

    addSystemMessage('📷 已收到图片：「' + file.name + '」。正在识别...');

    setTimeout(function () {
      var recognizedEvents = [
        '周一 08:00-10:00 高等数学',
        '周一 14:00-16:00 大学英语',
        '周二 10:00-12:00 数据结构',
        '周三 08:00-10:00 线性代数',
        '周四 14:00-16:00 操作系统',
        '周五 08:00-12:00 计算机网络'
      ];

      addSystemMessage('识别完成！提取到以下课程：');

      recognizedEvents.forEach(function (evt, i) {
        setTimeout(function () {
          addSystemMessage('• ' + evt);
        }, i * 150);
      });

      setTimeout(function () {
        addSystemMessage('已添加到固定日程。可继续提交其他需求。');
      }, recognizedEvents.length * 150 + 200);

      var demand = {
        id: ++demandIdCounter,
        type: 'event',
        text: '图片：' + file.name,
        days: 0,
        answers: { recognized: recognizedEvents },
        questions: []
      };
      state.demands.push(demand);
      renderDemandList();
      document.getElementById('generateBtn').style.display = 'inline-flex';

    }, 1200);

    input.value = '';
  };

  function showToast(text) {
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  window.ZHS = ZHS;

  renderSchedule();

  document.getElementById('reminderToggle').addEventListener('change', function () {
    state.reminderOn = this.checked;
    showToast(state.reminderOn ? '提醒已开启' : '提醒已关闭');
  });

  document.getElementById('autoNextToggle').addEventListener('change', function () {
    state.autoNextOn = this.checked;
    showToast(state.autoNextOn ? '自动跳转已开启' : '自动跳转已关闭');
  });

  document.getElementById('demandInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ZHS.submitDemand();
    }
  });

  document.getElementById('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      ZHS.submitAnswer();
    }
  });

  document.getElementById('authPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      ZHS.handleAuth();
    }
  });
})();
