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
      var typeNames = { goal: '学习目标', event: '日程事件', modify: '调整需求' };
      addSystemMessage('收到' + typeNames[type] + '「' + text.substring(0, 20) + (text.length > 20 ? '...' : '') + '」，约 <strong>' + demand.days + ' 天</strong>。');

      // 如果当前没有正在进行的对话，自动开始收集信息
      if (state.phase === 'idle') {
        setTimeout(function () {
          ZHS.generateSchedule();
        }, 600);
      }
    }, 200);
  };

  function renderDemandList() {
    var list = document.getElementById('demandList');
    if (state.demands.length === 0) {
      list.innerHTML = '';
      return;
    }
    var html = '';
    state.demands.forEach(function (d) {
      var typeNames = { goal: '目标', event: '事件', modify: '调整' };
      var typeColors = { goal: 'goal', event: 'event', modify: 'modify' };
      html += '<div class="demand-tag">';
      html += '<span class="type ' + typeColors[d.type] + '">' + typeNames[d.type] + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.text + '</span>';
      html += '<span style="font-size:0.65rem;color:var(--muted)">' + d.days + '天</span>';
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

    state.phase = 'collecting';
    state.dialogQueue = [];
    state.dialogIndex = 0;
    chatArea.innerHTML = '';

    state.demands.forEach(function (demand) {
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
    state.phase = 'generating';
    state.schedule = buildIntegratedSchedule();
    state.currentDay = 0;
    state.currentWeek = 0;
    state.phase = 'ready';

    renderSchedule();
    document.getElementById('totalProgress').style.display = 'block';
    document.getElementById('weekNav').style.display = 'flex';

    var total = calcTotalProgress();
    addSystemMessage('✅ 总行程表已生成！整合 <strong>' + state.demands.length + ' 个需求</strong>，共 ' + state.schedule.length + ' 天，' + total.total + ' 个任务。');

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

    var maxDays = 21;
    state.demands.forEach(function (d) {
      if (d.days > maxDays) maxDays = d.days;
    });
    if (maxDays > 60) maxDays = 60;

    var weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var schedule = [];
    var startDate = new Date(2026, 5, 22); // 2026-06-22

    for (var i = 0; i < maxDays; i++) {
      var weekday = weekDays[i % 7];
      var weekNum = Math.floor(i / 7) + 1;
      var blocks = [];

      var fixed = baseEvents[weekday] || [];
      fixed.forEach(function (e) { blocks.push(Object.assign({}, e)); });

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
    task.title = goal.text.substring(0, 10) + ' - ' + task.title;

    var subtask = null;
    if (dayIndex % 3 === 0 && dayIndex > 0) {
      subtask = {
        title: '检查进度并调整',
        detail: '回顾完成情况，根据实际进度调整后续计划',
        source: '系统反馈'
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
