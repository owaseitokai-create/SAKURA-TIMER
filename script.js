import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// --- テーマ設定の保存と適用 ---
const themeKey = eventId ? `theme_${eventId}` : 'theme_default';
const bgKey = eventId ? `customBg_${eventId}` : 'customBg_default';

function applyTheme() {
  const savedTheme = localStorage.getItem(themeKey) || 'theme-dark';
  document.body.className = savedTheme;
  const customBg = localStorage.getItem(bgKey);
  if (savedTheme === 'theme-custom' && customBg) {
    document.body.style.backgroundImage = `url(${customBg})`;
  } else {
    document.body.style.backgroundImage = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();

  // ★ URLにIDがない場合（未ログイン）
  if (!eventId) {
    const loginOverlay = document.getElementById('loginOverlay');
    if(loginOverlay) loginOverlay.classList.remove('hidden');
    
    document.getElementById('loginIsAdmin')?.addEventListener('change', (e) => {
      const pwInput = document.getElementById('loginAdminPw');
      if(e.target.checked) pwInput.classList.remove('hidden');
      else pwInput.classList.add('hidden');
    });

    document.getElementById('loginBtn')?.addEventListener('click', () => {
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
    return; // ここで処理を止める
  }

  // ★ ログイン成功後
  const mainContent = document.getElementById('mainContent');
  if(mainContent) mainContent.classList.remove('hidden');

  document.getElementById('roomNameDisplay').textContent = `Room: ${eventId}`;
  dbRef = ref(db, `events/${eventId}/stageData`);
  chatRef = ref(db, `events/${eventId}/chatMessages`);
  
  startApp();
});

function startApp() {
  setInterval(updateDisplay, 500);

  // 設定ボタンの動作
  document.getElementById('openSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('closeSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('hidden');
  
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = (e) => {
      localStorage.setItem(themeKey, e.target.getAttribute('data-theme'));
      applyTheme();
    };
  });

  document.getElementById('bgImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      localStorage.setItem(bgKey, event.target.result);
      localStorage.setItem(themeKey, 'theme-custom');
      applyTheme();
    };
    reader.readAsDataURL(file);
  });
  
  document.getElementById('clearBgBtn').onclick = () => {
    localStorage.removeItem(bgKey);
    localStorage.setItem(themeKey, 'theme-dark');
    applyTheme();
    document.getElementById('bgImageInput').value = "";
  };

  // ★修正1: チャットの完全同期（全員の画面でリアルタイム更新）
  onValue(chatRef, (snapshot) => {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    
    chatArea.innerHTML = ''; 
    const msgs = [];
    snapshot.forEach(child => msgs.push(child.val()));
    
    msgs.forEach(msg => {
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      div.style.borderBottom = '1px solid rgba(128,128,128,0.3)';
      div.style.paddingBottom = '5px';
      const timeStr = new Date(msg.time).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
      div.innerHTML = `<span style="font-size:0.8rem; opacity:0.6;">${timeStr}</span> <strong style="color:var(--accent-color)">${msg.name}:</strong> <span style="word-break: break-all;">${msg.text}</span>`;
      chatArea.appendChild(div);
    });
    chatArea.scrollTop = chatArea.scrollHeight; // 自動で一番下にスクロール
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
  const msgInput = document.getElementById('chatMessage');
  
  const sendMessage = () => {
    const nameInput = document.getElementById('chatName');
    const name = nameInput.value || '名無し';
    const msg = msgInput.value;
    if (msg) {
      push(chatRef, { name: name, text: msg, time: Date.now() });
      msgInput.value = '';
    }
  };

  if (sendBtn) sendBtn.onclick = sendMessage;
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // --- 管理者パネル ---
  const adminPanel = document.getElementById('adminPanel');
  if (isAdmin) {
    if (adminPanel) adminPanel.style.display = 'block';
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) clearChatBtn.style.display = 'block';

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
        if(confirm('チャット履歴を全て削除しますか？')) remove(chatRef); 
    };

    document.getElementById('manualCallBtn').onclick = () => {
        localStorage.setItem('callActive', localStorage.getItem('callActive') === 'true' ? 'false' : 'true');
        syncToCloud();
    };

    document.getElementById('clearBtn').onclick = () => {
        if(confirm(`【危険】全データをリセットしますか？`)){ 
            set(dbRef, null); 
            remove(chatRef); 
            localStorage.removeItem('groups');
            localStorage.removeItem('currentIndex');
            localStorage.removeItem('startTime');
            localStorage.removeItem('firstGroupStartTime');
            localStorage.removeItem('endTime');
            localStorage.removeItem('callActive');
            location.reload(); 
        }
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
                localStorage.setItem('endTime', Date.now()); 
                syncToCloud();
                updateDisplay();
            }
        }
    };
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

  // ★修正2: アラートをJSで直接表示・非表示コントロール（スマホ競合防止）
  const alertBox = document.getElementById('callAlert');
  if (alertBox) alertBox.style.display = callActive ? 'block' : 'none';

  const currentGroupEl = document.getElementById('currentGroup');
  const timerEl = document.getElementById('mainTimer');
  const statusEl = document.getElementById('statusBadge');
  const diffEl = document.getElementById('diffTime');
  const nextGroupEl = document.getElementById('nextGroupName');
  const nextPrepEl = document.getElementById('nextPrepareMsg');

  // 全演目終了時
  if (idx === groups.length && groups.length > 0) {
    if (currentGroupEl) currentGroupEl.textContent = "🎉 全演目終了";
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#fff"; }
    
    const endTime = parseInt(localStorage.getItem('endTime') || '0');
    if (firstGroupStartTime > 0 && endTime > 0) {
        let totalElapsed = 0;
        for (let i = 0; i < groups.length; i++) totalElapsed += groups[i].minutes * 60000;
        const diff = endTime - (firstGroupStartTime + totalElapsed);

        if (diffEl) diffEl.textContent = formatDiff(diff);
        if (statusEl) {
             if (diff > 60000) { statusEl.textContent = '全体押し'; statusEl.style.background = '#ff3b30'; }
             else if (diff < -60000) { statusEl.textContent = '全体巻き'; statusEl.style.background = '#007aff'; }
             else { statusEl.textContent = '予定通り'; statusEl.style.background = '#4caf50'; }
        }
    }
    if (nextGroupEl) nextGroupEl.textContent = "なし";
    if (nextPrepEl) nextPrepEl.style.display = 'none';
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

        if (diffEl) diffEl.textContent = formatDiff(diff);
        if (statusEl) {
             if (diff > 60000) { statusEl.textContent = '押し'; statusEl.style.background = '#ff3b30'; }
             else if (diff < -60000) { statusEl.textContent = '巻き'; statusEl.style.background = '#007aff'; }
             else { statusEl.textContent = '順調'; statusEl.style.background = '#4caf50'; }
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
    if (timerEl) { timerEl.textContent = "--:--"; timerEl.style.color = "inherit"; }
    if (diffEl) diffEl.textContent = "±00:00";
    if (statusEl) { statusEl.textContent = "待機中"; statusEl.style.background = "#555"; }
  }

  if (idx >= 0 && idx < groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    const currentRem = (groups[idx].minutes * 60000) - (Date.now() - startTime);
    if (currentRem < 180000 && nextPrepEl) nextPrepEl.style.display = 'inline';
    else if (nextPrepEl) nextPrepEl.style.display = 'none';
  } else if (idx === groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = "(全日程終了へ)";
    if (nextPrepEl) nextPrepEl.style.display = 'none';
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
    let actionHtml = isAdmin ? `<button class="btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="window.deleteGroup(${i})">削除</button>` : '-';
    tr.innerHTML = `<td class="col-num">${i+1}</td><td class="col-name">${g.name}</td><td class="col-time">${g.minutes}分</td><td class="col-action text-right">${actionHtml}</td>`;
    table.appendChild(tr);
  });
}

window.deleteGroup = (index) => {
  if (confirm('この団体を削除しますか？')) {
    const groups = JSON.parse(localStorage.getItem('groups') || '[]');
    groups.splice(index, 1);
    localStorage.setItem('groups', JSON.stringify(groups));
    syncToCloud();
  }
};
