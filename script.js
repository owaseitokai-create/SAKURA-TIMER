import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyAUPBnBRIhZr20MC7pFXTCp98H68kLpP7I",
  authDomain: "stage-42595.firebaseapp.com",
  databaseURL: "https://stage-42595-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "stage-42595",
  storageBucket: "stage-42595.appspot.com",
  messagingSenderId: "76110535150",
  appId: "1:76110535150:web:b9c972c82b9772c6870c"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('id');
const isAdmin = urlParams.get('pw') === 'seito';

let dbRef, chatRef; 

function applyTheme() {
  const savedTheme = localStorage.getItem('theme') || 'theme-dark';
  document.body.className = savedTheme;
  const customBg = localStorage.getItem('customBg');
  if (savedTheme === 'theme-custom' && customBg) {
    document.body.style.backgroundImage = `url(${customBg})`;
  } else {
    document.body.style.backgroundImage = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();

  if (!eventId) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginIsAdmin').addEventListener('change', (e) => {
      const pwInput = document.getElementById('loginAdminPw');
      if(e.target.checked) pwInput.classList.remove('hidden');
      else pwInput.classList.add('hidden');
    });

    document.getElementById('loginBtn').addEventListener('click', () => {
      const inputId = document.getElementById('loginEventId').value.trim();
      const isAdminCheck = document.getElementById('loginIsAdmin').checked;
      const inputPw = document.getElementById('loginAdminPw').value;
      if (!inputId) return alert("イベントIDを入力してください");
      if (!/^[a-zA-Z0-9_-]+$/.test(inputId)) return alert("IDは半角英数字とハイフンのみ");
      if (isAdminCheck && inputPw !== 'seito') return alert("パスワードが違います");
      let nextUrl = `?id=${inputId}`;
      if (isAdminCheck) nextUrl += `&pw=seito`;
      window.location.href = nextUrl;
    });
    return;
  }

  document.getElementById('roomNameDisplay').textContent = `Room: ${eventId}`;
  dbRef = ref(db, `events/${eventId}/stageData`);
  chatRef = ref(db, `events/${eventId}/chatMessages`);
  startApp();
});

function startApp() {
  setInterval(updateDisplay, 500);

  document.getElementById('openSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('closeSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('hidden');
  
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = (e) => {
      localStorage.setItem('theme', e.target.getAttribute('data-theme'));
      applyTheme();
    };
  });

  document.getElementById('bgImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      localStorage.setItem('customBg', event.target.result);
      localStorage.setItem('theme', 'theme-custom');
      applyTheme();
    };
    reader.readAsDataURL(file);
  });
  
  document.getElementById('clearBgBtn').onclick = () => {
    localStorage.removeItem('customBg');
    localStorage.setItem('theme', 'theme-dark');
    applyTheme();
    document.getElementById('bgImageInput').value = "";
  };

  const chatArea = document.getElementById('chatArea');
  onChildAdded(chatRef, (snapshot) => {
    const msg = snapshot.val();
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.style.borderBottom = '1px solid rgba(128,128,128,0.3)';
    div.style.paddingBottom = '5px';
    const timeStr = new Date(msg.time).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `<span style="font-size:0.8rem; opacity:0.6;">${timeStr}</span> <strong style="color:var(--accent-color)">${msg.name}:</strong> ${msg.text}`;
    if (chatArea) chatArea.prepend(div);
  });

  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      if (data.groups) localStorage.setItem('groups', JSON.stringify(data.groups));
      localStorage.setItem('currentIndex', (data.currentIndex !== undefined) ? data.currentIndex : -1);
      localStorage.setItem('startTime', (data.startTime !== undefined) ? data.startTime : 0);
      localStorage.setItem('firstGroupStartTime', (data.firstGroupStartTime !== undefined) ? data.firstGroupStartTime : 0);
      localStorage.setItem('endTime', (data.endTime !== undefined) ? data.endTime : 0);
      localStorage.setItem('callActive', data.callActive);
      renderGroupList();
      updateDisplay();
    }
  });

  const sendBtn = document.getElementById('sendChatBtn');
  if (sendBtn) sendBtn.onclick = () => {
    const msgInput = document.getElementById('chatMessage');
    if (msgInput.value) {
      push(chatRef, { name: document.getElementById('chatName').value || '名無し', text: msgInput.value, time: Date.now() });
      msgInput.value = '';
    }
  };

  const adminPanel = document.getElementById('adminPanel');
  if (isAdmin) {
    if (adminPanel) adminPanel.classList.remove('hidden');
    document.getElementById('clearChatBtn').classList.remove('hidden');

    document.getElementById('addBtn').onclick = () => {
      const name = document.getElementById('groupInput').value;
      const mins = parseInt(document.getElementById('minutesInput').value);
      if (name && mins) {
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        groups.push({ name: name, minutes: mins });
        localStorage.setItem('groups', JSON.stringify(groups));
        document.getElementById('groupInput').value = '';
        syncToCloud();
      }
    };

    document.getElementById('clearChatBtn').onclick = () => {
        if(confirm('チャット履歴を全て削除しますか？')) { remove(chatRef); if(chatArea) chatArea.innerHTML = ''; }
    };

    document.getElementById('manualCallBtn').onclick = () => {
        localStorage.setItem('callActive', localStorage.getItem('callActive') === 'true' ? 'false' : 'true');
        syncToCloud();
    };

    document.getElementById('clearBtn').onclick = () => {
        if(confirm(`【危険】全データをリセットしますか？`)){ set(dbRef, null); remove(chatRef); localStorage.clear(); location.reload(); }
    };

    document.getElementById('startFirst').onclick = () => {
        const gs = JSON.parse(localStorage.getItem('groups') || '[]');
        if (!gs.length) return alert("団体がありません");
        if(confirm('最初の団体からスタートしますか？')){ window.startGroup(0); }
    };

    document.getElementById('nextBtn').onclick = () => {
        const idx = parseInt(localStorage.getItem('currentIndex') || '-1');
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        const nextIdx = idx + 1;
        
        if (nextIdx < groups.length) {
            window.startGroup(nextIdx);
        } else if (nextIdx === groups.length) {
            if (confirm("全ての演目を終了しますか？")) {
                localStorage.setItem('currentIndex', nextIdx);
                localStorage.setItem('endTime', Date.now()); // 終了時刻を確定！
                syncToCloud();
                updateDisplay();
            }
        }
    };
  } else {
    if (adminPanel) adminPanel.classList.add('hidden');
  }
}

function syncToCloud() {
  if (!isAdmin) return;
  set(dbRef, {
    groups: JSON.parse(localStorage.getItem('groups') || '[]'),
    currentIndex: parseInt(localStorage.getItem('currentIndex') || '-1'),
    startTime: parseInt(localStorage.getItem('startTime') || '0'), 
    firstGroupStartTime: parseInt(localStorage.getItem('firstGroupStartTime') || '0'),
    endTime: parseInt(localStorage.getItem('endTime') || '0'),
    callActive: localStorage.getItem('callActive') === 'true'
  });
}

const pad = (n) => n.toString().padStart(2, '0');
const formatTime = (ms) => {
  if (ms < 0) ms = 0;
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
};
const formatDiff = (diffMs) => {
  const abs = Math.abs(diffMs);
  return `${diffMs >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60000))}:${pad(Math.floor((abs % 60000) / 1000))}`;
};

window.startGroup = (newIndex) => {
  localStorage.setItem('currentIndex', newIndex);
  localStorage.setItem('startTime', Date.now());
  if (newIndex === 0) {
      localStorage.setItem('firstGroupStartTime', Date.now());
      localStorage.setItem('endTime', 0);
  }
  localStorage.setItem('callActive', 'false');
  syncToCloud();
};

function updateDisplay() {
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  const idx = parseInt(localStorage.getItem('currentIndex') || '-1');
  const startTime = parseInt(localStorage.getItem('startTime') || '0'); 
  const firstGroupStartTime = parseInt(localStorage.getItem('firstGroupStartTime') || '0');
  const callActive = localStorage.getItem('callActive') === 'true';

  const schedEl = document.getElementById('stageSchedule');
  let totalMinutes = groups.reduce((sum, g) => sum + g.minutes, 0);
  if (firstGroupStartTime > 0) {
      const endD = new Date(firstGroupStartTime + totalMinutes * 60000);
      const startD = new Date(firstGroupStartTime);
      schedEl.textContent = `Schedule: ${pad(startD.getHours())}:${pad(startD.getMinutes())} - ${pad(endD.getHours())}:${pad(endD.getMinutes())} (計${totalMinutes}分)`;
  } else {
      schedEl.textContent = `Total: ${totalMinutes} min`;
  }

  const alertBox = document.getElementById('callAlert');
  if (alertBox) callActive ? alertBox.classList.remove('hidden') : alertBox.classList.add('hidden');

  const currentGroupEl = document.getElementById('currentGroup');
  const timerEl = document.getElementById('mainTimer');
  const statusEl = document.getElementById('statusBadge');
  const diffEl = document.getElementById('diffTime');
  const nextGroupEl = document.getElementById('nextGroupName');
  const nextPrepEl = document.getElementById('nextPrepareMsg');

  // ★全演目終了時のロジック（テスト動作にも対応）
  if (idx === groups.length && groups.length > 0) {
    if (currentGroupEl) currentGroupEl.textContent = "🎉 全演目終了";
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#fff"; }
    
    const endTime = parseInt(localStorage.getItem('endTime') || '0');
    
    // 最初から開始が押されていて、ちゃんと終了時間が記録されている場合のみ計算
    if (firstGroupStartTime > 0 && endTime > 0) {
        let totalElapsed = 0;
        for (let i = 0; i < groups.length; i++) totalElapsed += groups[i].minutes * 60000;
        const idealEndTime = firstGroupStartTime + totalElapsed;
        const diff = endTime - idealEndTime;

        if (diffEl) {
            diffEl.textContent = formatDiff(diff);
            if (diff > 60000) diffEl.style.color = '#ff3b30'; // 押し
            else if (diff < -60000) diffEl.style.color = '#00e5ff'; // 巻き
            else diffEl.style.color = '#4caf50'; // 順調
        }
        if (statusEl) {
             if (diff > 60000) { statusEl.textContent = '全体押し'; statusEl.style.color = '#ff3b30'; }
             else if (diff < -60000) { statusEl.textContent = '全体巻き'; statusEl.style.color = '#00e5ff'; }
             else { statusEl.textContent = '予定通り'; statusEl.style.color = '#4caf50'; }
        }
    } else {
        // テスト等で「最初から開始」を押さずに最後まで進めた場合
        if (diffEl) { diffEl.textContent = "--:--"; diffEl.style.color = "#aaa"; }
        if (statusEl) { statusEl.textContent = "データなし"; statusEl.style.color = "#aaa"; }
    }

    if (nextGroupEl) nextGroupEl.textContent = "なし";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  } 
  // 通常進行中
  else if (idx >= 0 && idx < groups.length) {
    const g = groups[idx];
    if (currentGroupEl) currentGroupEl.textContent = g.name;

    const remaining = (g.minutes * 60000) - (Date.now() - startTime);

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.style.color = remaining < 0 ? '#ff3b30' : (remaining < 60000 ? '#ffcc00' : ''); 
    }

    if (firstGroupStartTime > 0 && firstGroupStartTime <= Date.now()) {
        let idealElapsed = 0;
        for (let i = 0; i < idx; i++) idealElapsed += groups[i].minutes * 60000;
        const diff = startTime - (firstGroupStartTime + idealElapsed);

        if (diffEl) {
            diffEl.textContent = formatDiff(diff);
            if (diff > 60000) diffEl.style.color = '#ff3b30';
            else if (diff < -60000) diffEl.style.color = '#00e5ff'; 
            else diffEl.style.color = '#4caf50';
        }
        if (statusEl) {
             if (diff > 60000) { statusEl.textContent = '押し'; statusEl.style.color = '#ff3b30'; }
             else if (diff < -60000) { statusEl.textContent = '巻き'; statusEl.style.color = '#00e5ff'; }
             else { statusEl.textContent = '順調'; statusEl.style.color = '#4caf50'; }
        }
    }

    if (isAdmin && remaining <= 0) {
      const autoCheck = document.getElementById('autoAdvance');
      if (autoCheck && autoCheck.checked && remaining < -2000) window.startGroup(idx + 1); 
    }
  } 
  // 待機中
  else {
    if (currentGroupEl) currentGroupEl.textContent = "---";
    if (timerEl) { timerEl.textContent = "--:--"; timerEl.style.color = "inherit"; opacity = 0.5; }
    if (diffEl) diffEl.textContent = "";
    if (statusEl) { statusEl.textContent = "待機中"; statusEl.style.color = "inherit"; }
  }

  // 次の団体
  if (idx >= 0 && idx < groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    const currentRem = (groups[idx].minutes * 60000) - (Date.now() - startTime);
    if (currentRem < 180000 && nextPrepEl) nextPrepEl.classList.remove('hidden');
    else if (nextPrepEl) nextPrepEl.classList.add('hidden');
  } else if (idx === groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = "(全日程終了へ)";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  }

  const rows = document.querySelectorAll('#groupsTable tbody tr');
  rows.forEach((tr, i) => i === idx ? tr.classList.add('current-row') : tr.classList.remove('current-row'));
}

function renderGroupList() {
  const table = document.querySelector('#groupsTable tbody');
  if (!table) return;
  table.innerHTML = '';
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  
  groups.forEach((g, i) => {
    const tr = document.createElement('tr');
    let actionHtml = isAdmin ? `
      <div class="action-buttons">
        <button class="btn-action btn-insert" onclick="window.insertGroup(${i})">上に挿入</button>
        <button class="btn-action btn-delete" onclick="window.deleteGroup(${i})">削除</button>
      </div>
    ` : '-';
    tr.innerHTML = `<td>${i+1}</td><td>${g.name}</td><td>${g.minutes}分</td><td class="text-right">${actionHtml}</td>`;
    table.appendChild(tr);
  });
}

window.insertGroup = (index) => {
  const name = prompt("上に挿入する団体名を入力:");
  if (!name) return;
  const minsStr = prompt("持ち時間(分)を入力:", "5");
  if (!minsStr) return;
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  groups.splice(index, 0, { name: name, minutes: parseInt(minsStr) });
  localStorage.setItem('groups', JSON.stringify(groups));
  syncToCloud();
};

window.deleteGroup = (index) => {
  if (confirm('この団体を削除しますか？')) {
    const groups = JSON.parse(localStorage.getItem('groups') || '[]');
    groups.splice(index, 1);
    localStorage.setItem('groups', JSON.stringify(groups));
    syncToCloud();
  }
};