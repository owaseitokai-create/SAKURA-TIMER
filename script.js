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

// --- 部屋(イベント)の判定と初期化 ---
const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('id');
const isAdmin = urlParams.get('pw') === 'seito'; // ※運用時はパスワードをここでも変更できます

let dbRef, chatRef; 

// --- 背景・テーマ設定ロジック ---
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

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(); // 背景を反映

  // 1. ログイン画面の処理
  if (!eventId) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    
    // パスワード入力欄の表示切替
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
      if (!/^[a-zA-Z0-9_-]+$/.test(inputId)) return alert("IDは半角英数字とハイフンのみ使用できます");
      if (isAdminCheck && inputPw !== 'seito') return alert("パスワードが違います");

      let nextUrl = `?id=${inputId}`;
      if (isAdminCheck) nextUrl += `&pw=seito`;
      window.location.href = nextUrl; // URLを変えてリロード
    });
    return; // イベントIDがない場合はここで処理を止める
  }

  // 2. イベントIDがある場合（通常起動）
  document.getElementById('roomNameDisplay').textContent = `Room: ${eventId}`;
  
  // FirebaseのパスをイベントIDごとに分ける
  dbRef = ref(db, `events/${eventId}/stageData`);
  chatRef = ref(db, `events/${eventId}/chatMessages`);

  startApp();
});


// =========================================================
//  アプリメイン処理
// =========================================================
function startApp() {
  setInterval(updateDisplay, 500);

  // 設定モーダルの操作 (閲覧者・管理者共通で使える)
  document.getElementById('openSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('closeSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('hidden');
  
  // テーマ変更ボタン
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = (e) => {
      const theme = e.target.getAttribute('data-theme');
      localStorage.setItem('theme', theme);
      applyTheme();
    };
  });

  // カスタム画像アップロード
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

  // チャット読み込み
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

  // Firebaseデータ同期
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      if (data.groups) localStorage.setItem('groups', JSON.stringify(data.groups));
      localStorage.setItem('currentIndex', (data.currentIndex !== undefined) ? data.currentIndex : -1);
      localStorage.setItem('startTime', (data.startTime !== undefined) ? data.startTime : 0);
      localStorage.setItem('firstGroupStartTime', (data.firstGroupStartTime !== undefined) ? data.firstGroupStartTime : 0);
      localStorage.setItem('callActive', data.callActive);
      
      renderGroupList();
      updateDisplay();
    }
  });

  // チャット送信
  const sendBtn = document.getElementById('sendChatBtn');
  if (sendBtn) sendBtn.onclick = () => {
    const nameInput = document.getElementById('chatName');
    const msgInput = document.getElementById('chatMessage');
    const name = nameInput.value || '名無し';
    const msg = msgInput.value;
    if (msg) {
      push(chatRef, { name: name, text: msg, time: Date.now() });
      msgInput.value = '';
    }
  };

  // --- 管理者専用エリアの構築 ---
  const adminPanel = document.getElementById('adminPanel');
  const clearChatBtn = document.getElementById('clearChatBtn');

  if (isAdmin) {
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (clearChatBtn) clearChatBtn.classList.remove('hidden');

    // 下に追加ボタン
    const addBtn = document.getElementById('addBtn');
    if (addBtn) addBtn.onclick = () => {
      const nameInput = document.getElementById('groupInput');
      const minInput = document.getElementById('minutesInput');
      const name = nameInput.value;
      const mins = parseInt(minInput.value);
      if (name && mins) {
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        groups.push({ name: name, minutes: mins });
        localStorage.setItem('groups', JSON.stringify(groups));
        nameInput.value = '';
        syncToCloud();
      }
    };

    if (clearChatBtn) clearChatBtn.onclick = () => {
        if(confirm('チャット履歴を全て削除しますか？')) { remove(chatRef); if(chatArea) chatArea.innerHTML = ''; }
    };

    const manualCallBtn = document.getElementById('manualCallBtn');
    if (manualCallBtn) manualCallBtn.onclick = () => {
        const current = localStorage.getItem('callActive') === 'true';
        localStorage.setItem('callActive', !current);
        syncToCloud();
    };

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.onclick = () => {
        if(confirm(`【危険】Room: ${eventId} の全データをリセットしますか？`)){
          set(dbRef, null); remove(chatRef); localStorage.clear(); location.reload();
        }
    };

    const startFirstBtn = document.getElementById('startFirst');
    if (startFirstBtn) startFirstBtn.onclick = () => {
        const gs = JSON.parse(localStorage.getItem('groups') || '[]');
        if (!gs.length) return alert("団体が登録されていません");
        if(confirm('最初の団体からスタートしますか？')){ window.startGroup(0); }
    };

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.onclick = () => {
        const idx = parseInt(localStorage.getItem('currentIndex') || '-1');
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        
        if (idx < groups.length) {
            window.startGroup(idx + 1);
        }
    };
  } else {
    if (adminPanel) adminPanel.classList.add('hidden');
    if (clearChatBtn) clearChatBtn.classList.add('hidden');
  }
}

// =========================================================
//  補助・画面更新ロジック
// =========================================================
function syncToCloud() {
  if (!isAdmin) return;
  const data = {
    groups: JSON.parse(localStorage.getItem('groups') || '[]'),
    currentIndex: parseInt(localStorage.getItem('currentIndex') || '-1'),
    startTime: parseInt(localStorage.getItem('startTime') || '0'), 
    firstGroupStartTime: parseInt(localStorage.getItem('firstGroupStartTime') || '0'),
    callActive: localStorage.getItem('callActive') === 'true'
  };
  set(dbRef, data);
}

const pad = (n) => n.toString().padStart(2, '0');
const formatTime = (ms) => {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad(m)}:${pad(s)}`;
};
const formatDiff = (diffMs) => {
  const abs = Math.abs(diffMs);
  const m = Math.floor(abs / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const sign = diffMs >= 0 ? '+' : '-'; 
  return `${sign}${pad(m)}:${pad(s)}`;
};

window.startGroup = (newIndex) => {
  localStorage.setItem('currentIndex', newIndex);
  localStorage.setItem('startTime', Date.now());
  if (newIndex === 0) localStorage.setItem('firstGroupStartTime', Date.now());
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
      const fmt = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const startD = new Date(firstGroupStartTime);
      schedEl.textContent = `Schedule: ${fmt(startD)} - ${fmt(endD)} (計${totalMinutes}分)`;
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

  // 全演目終了状態
  if (idx === groups.length && groups.length > 0) {
    if (currentGroupEl) currentGroupEl.textContent = "🎉 全演目終了";
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#888"; }
    if (diffEl) diffEl.textContent = "お疲れ様でした";
    if (statusEl) { statusEl.textContent = "終了"; statusEl.style.color = "#888"; }
    if (nextGroupEl) nextGroupEl.textContent = "なし";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  } 
  // 通常進行中
  else if (idx >= 0 && idx < groups.length) {
    const g = groups[idx];
    if (currentGroupEl) currentGroupEl.textContent = g.name;

    const elapsed = Date.now() - startTime;
    const remaining = (g.minutes * 60000) - elapsed;

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      if (remaining < 0) timerEl.style.color = '#ff3b30';
      else if (remaining < 60000) timerEl.style.color = '#ffcc00';
      else timerEl.style.color = ''; 
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

  // 次の団体表示
  if (idx >= 0 && idx < groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    const elapsed = Date.now() - startTime;
    const currentRem = (groups[idx].minutes * 60000) - elapsed;
    if (currentRem < 180000 && nextPrepEl) nextPrepEl.classList.remove('hidden');
    else if (nextPrepEl) nextPrepEl.classList.add('hidden');
  } else if (idx === groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = "(全日程終了へ)";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  }

  // リストのハイライト更新
  const rows = document.querySelectorAll('#groupsTable tbody tr');
  rows.forEach((tr, i) => {
    if (i === idx) tr.classList.add('current-row');
    else tr.classList.remove('current-row');
  });
}

function renderGroupList() {
  const table = document.querySelector('#groupsTable tbody');
  if (!table) return;
  table.innerHTML = '';
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  
  groups.forEach((g, i) => {
    const tr = document.createElement('tr');
    
    let actionHtml = '';
    if(isAdmin) {
        actionHtml = `
          <div class="action-buttons">
            <button class="btn-action btn-insert" onclick="window.insertGroup(${i})" title="上に挿入">上に挿入</button>
            <button class="btn-action btn-delete" onclick="window.deleteGroup(${i})" title="削除">削除</button>
          </div>
        `;
    } else {
        actionHtml = '-'; 
    }

    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${g.name}</td>
      <td>${g.minutes}分</td>
      <td class="text-right">${actionHtml}</td>
    `;
    table.appendChild(tr);
  });
}

// リストからの挿入・削除処理
window.insertGroup = (index) => {
  const name = prompt("上に挿入する団体名を入力してください:");
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