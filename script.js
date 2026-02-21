import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// ★追加: 端末間の時計のズレを無くすためのサーバー時刻補正
let serverTimeOffset = 0;
const offsetRef = ref(db, ".info/serverTimeOffset");
onValue(offsetRef, (snap) => {
  serverTimeOffset = snap.val() || 0;
});
// 常に全員が同じ基準の時間を取得できる関数
function getSyncedTime() {
  return Date.now() + serverTimeOffset;
}

// データの安全な読み込み用ヘルパー
const getIntItem = (key, def) => { const v = parseInt(localStorage.getItem(key)); return isNaN(v) ? def : v; };
const getBoolItem = (key, def) => { const v = localStorage.getItem(key); return v === 'true' ? true : (v === 'false' ? false : def); };

const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('id');
const isAdmin = urlParams.get('pw') === 'seito';

let dbRef, chatRef; 

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

  // ログイン画面の処理
  if (!eventId) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginIsAdmin').addEventListener('change', (e) => {
      const pwInput = document.getElementById('loginAdminPw');
      if(e.target.checked) pwInput.classList.remove('hidden');
      else pwInput.classList.add('hidden');
    });

    document.getElementById('loginBtn').addEventListener('click', () => {
      // スマホの予測変換などで大文字が入っても小文字に統一して同じ部屋に入れるように修正
      const inputId = document.getElementById('loginEventId').value.trim().toLowerCase();
      const isAdminCheck = document.getElementById('loginIsAdmin').checked;
      const inputPw = document.getElementById('loginAdminPw').value;
      
      if (!inputId) return alert("イベントIDを入力してください");
      if (!/^[a-z0-9_-]+$/.test(inputId)) return alert("IDは半角英数字とハイフンのみです");
      if (isAdminCheck && inputPw !== 'seito') return alert("パスワードが違います");
      
      let nextUrl = `?id=${inputId}`;
      if (isAdminCheck) nextUrl += `&pw=seito`;
      window.location.href = nextUrl;
    });
    return;
  }

  // ルーム入室成功
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

  // ★チャットシステムを改善（一番下が最新になるように修正＆自動スクロール）
  const chatArea = document.getElementById('chatArea');
  onValue(chatRef, (snapshot) => {
    if (!chatArea) return;
    chatArea.innerHTML = ''; 
    
    const messages = [];
    snapshot.forEach((childSnap) => {
      messages.push(childSnap.val());
    });

    messages.forEach((msg) => {
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      div.style.borderBottom = '1px solid rgba(128,128,128,0.3)';
      div.style.paddingBottom = '5px';
      
      const timeSpan = document.createElement('span');
      timeSpan.style.fontSize = '0.8rem';
      timeSpan.style.opacity = '0.6';
      
      // PC/スマホで差が出ないよう手動で時間をフォーマット
      const d = new Date(msg.time);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      timeSpan.textContent = `${h}:${m} `;
      
      const nameSpan = document.createElement('strong');
      nameSpan.style.color = 'var(--accent-color)';
      nameSpan.textContent = msg.name + ': ';
      
      const textSpan = document.createElement('span');
      textSpan.textContent = msg.text;
      
      div.appendChild(timeSpan);
      div.appendChild(nameSpan);
      div.appendChild(textSpan);
      chatArea.appendChild(div);
    });

    // メッセージが追加されたら一番下にスクロール
    setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight; }, 50);
  });

  // タイマーのデータ同期（NaNエラー防止）
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      if (data.groups) localStorage.setItem('groups', JSON.stringify(data.groups));
      localStorage.setItem('currentIndex', data.currentIndex ?? -1);
      localStorage.setItem('startTime', data.startTime ?? 0);
      localStorage.setItem('firstGroupStartTime', data.firstGroupStartTime ?? 0);
      localStorage.setItem('endTime', data.endTime ?? 0);
      localStorage.setItem('callActive', data.callActive ?? false);
      renderGroupList();
      updateDisplay();
    }
  });

  const sendBtn = document.getElementById('sendChatBtn');
  const msgInput = document.getElementById('chatMessage');
  
  const sendMessage = () => {
    const text = msgInput.value.trim();
    if (text) {
      push(chatRef, { 
        name: document.getElementById('chatName').value.trim() || '名無し', 
        text: text, 
        time: getSyncedTime() // サーバー時刻を使用
      });
      msgInput.value = '';
    }
  };

  if (sendBtn) sendBtn.onclick = sendMessage;
  
  // ★スマホのキーボードの「確定/Enter」でも送信・暴発防止
  if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); 
        sendMessage();
      }
    });
  }

  // --- 管理者パネル ---
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
        if(confirm('チャット履歴を全て削除しますか？全員の画面から消えます。')) { remove(chatRef); }
    };

    document.getElementById('manualCallBtn').onclick = () => {
        localStorage.setItem('callActive', getBoolItem('callActive', false) ? 'false' : 'true');
        syncToCloud();
    };

    document.getElementById('clearBtn').onclick = () => {
        if(confirm(`【危険】全データをリセットしますか？`)){ 
            set(dbRef, null); 
            remove(chatRef); 
            localStorage.clear();
            location.reload(); 
        }
    };

    document.getElementById('startFirst').onclick = () => {
        const gs = JSON.parse(localStorage.getItem('groups') || '[]');
        if (!gs.length) return alert("団体がありません");
        if(confirm('最初の団体からスタートしますか？')){ window.startGroup(0); }
    };

    document.getElementById('nextBtn').onclick = () => {
        const idx = getIntItem('currentIndex', -1);
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        const nextIdx = idx + 1;
        
        if (nextIdx < groups.length) {
            window.startGroup(nextIdx);
        } else if (nextIdx === groups.length) {
            if (confirm("全ての演目を終了しますか？")) {
                localStorage.setItem('currentIndex', nextIdx);
                localStorage.setItem('endTime', getSyncedTime()); 
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
    currentIndex: getIntItem('currentIndex', -1),
    startTime: getIntItem('startTime', 0), 
    firstGroupStartTime: getIntItem('firstGroupStartTime', 0),
    endTime: getIntItem('endTime', 0),
    callActive: getBoolItem('callActive', false)
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
  localStorage.setItem('startTime', getSyncedTime()); // サーバー時刻を使用
  if (newIndex === 0) {
      localStorage.setItem('firstGroupStartTime', getSyncedTime());
      localStorage.setItem('endTime', 0);
  }
  localStorage.setItem('callActive', 'false');
  syncToCloud();
};

function updateDisplay() {
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  const idx = getIntItem('currentIndex', -1);
  const startTime = getIntItem('startTime', 0); 
  const firstGroupStartTime = getIntItem('firstGroupStartTime', 0);
  const callActive = getBoolItem('callActive', false);

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

  if (idx === groups.length && groups.length > 0) {
    if (currentGroupEl) currentGroupEl.textContent = "🎉 全演目終了";
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#fff"; }
    
    const endTime = getIntItem('endTime', 0);
    
    if (firstGroupStartTime > 0 && endTime > 0) {
        let totalElapsed = 0;
        for (let i = 0; i < groups.length; i++) totalElapsed += groups[i].minutes * 60000;
        const idealEndTime = firstGroupStartTime + totalElapsed;
        const diff = endTime - idealEndTime;

        if (diffEl) {
            diffEl.textContent = formatDiff(diff);
            if (diff > 60000) diffEl.style.color = '#ff3b30'; 
            else if (diff < -60000) diffEl.style.color = '#00e5ff'; 
            else diffEl.style.color = '#4caf50'; 
        }
        if (statusEl) {
             if (diff > 60000) { statusEl.textContent = '全体押し'; statusEl.style.color = '#ff3b30'; }
             else if (diff < -60000) { statusEl.textContent = '全体巻き'; statusEl.style.color = '#00e5ff'; }
             else { statusEl.textContent = '予定通り'; statusEl.style.color = '#4caf50'; }
        }
    }

    if (nextGroupEl) nextGroupEl.textContent = "なし";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  } 
  else if (idx >= 0 && idx < groups.length) {
    const g = groups[idx];
    if (currentGroupEl) currentGroupEl.textContent = g.name;

    // 現在時刻にもサーバー時刻を使用
    const remaining = (g.minutes * 60000) - (getSyncedTime() - startTime);

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.style.color = remaining < 0 ? '#ff3b30' : (remaining < 60000 ? '#ffcc00' : ''); 
    }

    if (firstGroupStartTime > 0 && firstGroupStartTime <= getSyncedTime()) {
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
  else {
    if (currentGroupEl) currentGroupEl.textContent = "---";
    if (timerEl) { timerEl.textContent = "--:--"; timerEl.style.color = "inherit"; timerEl.style.opacity = "0.5"; }
    if (diffEl) diffEl.textContent = "";
    if (statusEl) { statusEl.textContent = "待機中"; statusEl.style.color = "inherit"; }
  }

  if (idx >= 0 && idx < groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    const currentRem = (groups[idx].minutes * 60000) - (getSyncedTime() - startTime);
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