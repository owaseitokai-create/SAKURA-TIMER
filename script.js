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
const dbRef = ref(db, 'stageData');
const chatRef = ref(db, 'chatMessages');

// --- 管理者判定 ---
const ADMIN_PASSWORD = "seito";
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('pw') === ADMIN_PASSWORD;

// --- 便利関数 ---
const now = () => Date.now();
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

// --- データ同期 (管理者のみ実行) ---
function syncToCloud() {
  if (!isAdmin) return;
  // localStorageにある最新状態をFirebaseに送る
  const data = {
    groups: JSON.parse(localStorage.getItem('groups') || '[]'),
    currentIndex: parseInt(localStorage.getItem('currentIndex') || '-1'),
    startTime: parseInt(localStorage.getItem('startTime') || '0'), 
    firstGroupStartTime: parseInt(localStorage.getItem('firstGroupStartTime') || '0'),
    callActive: localStorage.getItem('callActive') === 'true'
  };
  set(dbRef, data);
}

// --- 画面更新 ---
function updateDisplay() {
  // localStorageからデータを取得して表示する
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  const idx = parseInt(localStorage.getItem('currentIndex') || '-1');
  const startTime = parseInt(localStorage.getItem('startTime') || '0'); 
  const firstGroupStartTime = parseInt(localStorage.getItem('firstGroupStartTime') || '0');
  const callActive = localStorage.getItem('callActive') === 'true';

  // 1. 全体スケジュール表示
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

  // 2. アラート
  const alertBox = document.getElementById('callAlert');
  if (alertBox) {
    if (callActive) {
      alertBox.classList.remove('hidden');
    } else {
      alertBox.classList.add('hidden');
    }
  }

  // 3. タイマー & 押し巻き計算
  const currentGroupEl = document.getElementById('currentGroup');
  const timerEl = document.getElementById('mainTimer');
  const statusEl = document.getElementById('statusBadge');
  const diffEl = document.getElementById('diffTime');

  if (idx >= 0 && idx < groups.length) {
    const g = groups[idx];
    if (currentGroupEl) currentGroupEl.textContent = g.name;

    // A. 残り時間
    const elapsed = now() - startTime;
    const remaining = (g.minutes * 60000) - elapsed;

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      if (remaining < 0) timerEl.style.color = '#ff3b30'; // 赤
      else if (remaining < 60000) timerEl.style.color = '#ffcc00'; // 黄
      else timerEl.style.color = '#fff';
    }

    // B. 押し巻き判定 (厳密化)
    // firstGroupStartTime が 0 または 未来(ありえないが) の場合は計算しない
    if (firstGroupStartTime > 0 && firstGroupStartTime <= now()) {
        // この団体が始まるまでに経過しているはずの理想時間（前の団体までの合計時間）
        let idealElapsed = 0;
        for (let i = 0; i < idx; i++) {
            idealElapsed += groups[i].minutes * 60000;
        }
        // 理想の開始時刻
        const idealStartTime = firstGroupStartTime + idealElapsed;
        
        // ズレ = 実際の開始時刻(startTime) - 理想の開始時刻
        const diff = startTime - idealStartTime;

        if (diffEl) {
            diffEl.textContent = formatDiff(diff);
            if (diff > 60000) diffEl.style.color = '#ff3b30'; // 遅れ
            else if (diff < -60000) diffEl.style.color = '#007aff'; // 巻き
            else diffEl.style.color = '#28a745'; // オンタイム
        }
        
        if (statusEl) {
             if (diff > 60000) {
                statusEl.textContent = '押し';
                statusEl.style.color = '#ff3b30';
             } else if (diff < -60000) {
                statusEl.textContent = '巻き';
                statusEl.style.color = '#007aff';
             } else {
                statusEl.textContent = '順調';
                statusEl.style.color = '#28a745';
             }
        }
    } else {
        // データがない、または開始前
        if(diffEl) diffEl.textContent = "±00:00";
        if(statusEl) { statusEl.textContent = "--"; statusEl.style.color = "#888"; }
    }

    // 自動進行 (管理者のみ)
    if (isAdmin && remaining <= 0) {
      const autoCheck = document.getElementById('autoAdvance');
      if (autoCheck && autoCheck.checked && remaining < -2000) { 
         window.startGroup(idx + 1); 
      }
    }

  } else {
    // 待機中
    if (currentGroupEl) currentGroupEl.textContent = "---";
    if (timerEl) { timerEl.textContent = "--:--"; timerEl.style.color = "#888"; }
    if (diffEl) diffEl.textContent = "";
    if (statusEl) { statusEl.textContent = "待機中"; statusEl.style.color = "#888"; }
  }

  // 4. 次の団体
  const nextGroupEl = document.getElementById('nextGroupName');
  const nextPrepEl = document.getElementById('nextPrepareMsg');
  if (idx + 1 < groups.length) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    
    let currentRem = 999999;
    if(idx >= 0) {
        const elapsed = now() - startTime;
        currentRem = (groups[idx].minutes * 60000) - elapsed;
    }
    
    if (idx >= 0 && currentRem < 180000) {
        if(nextPrepEl) nextPrepEl.classList.remove('hidden');
    } else {
        if(nextPrepEl) nextPrepEl.classList.add('hidden');
    }
  } else {
    if (nextGroupEl) nextGroupEl.textContent = "(終了)";
    if (nextPrepEl) nextPrepEl.classList.add('hidden');
  }

  // 5. リストのハイライト
  const rows = document.querySelectorAll('#groupsTable tbody tr');
  rows.forEach((tr, i) => {
    if (i === idx) {
        tr.style.background = '#333';
        tr.style.color = '#fff';
        tr.style.fontWeight = 'bold';
    } else {
        tr.style.background = 'transparent';
        tr.style.color = '#bbb';
        tr.style.fontWeight = 'normal';
    }
  });
}

// --- リスト描画 ---
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
          <button class="btn-mini-success" onclick="window.insertGroup(${i})" title="挿入">＋</button>
          <button class="btn-mini-danger" onclick="window.deleteGroup(${i})" title="削除">×</button>
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

// =========================================================
//  Window関数 (ボタン操作)
// =========================================================

window.addGroup = () => {
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
    renderGroupList();
    updateDisplay();
  }
};

window.insertGroup = (index) => {
  const name = prompt("挿入する団体名を入力してください:");
  if (!name) return;
  const minsStr = prompt("持ち時間(分)を入力してください:", "5");
  if (!minsStr) return;
  const mins = parseInt(minsStr);
  
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  groups.splice(index, 0, { name: name, minutes: mins });
  localStorage.setItem('groups', JSON.stringify(groups));
  
  syncToCloud();
  renderGroupList();
  updateDisplay();
};

window.deleteGroup = (index) => {
  if (confirm('この団体を削除しますか？')) {
    const groups = JSON.parse(localStorage.getItem('groups') || '[]');
    groups.splice(index, 1);
    localStorage.setItem('groups', JSON.stringify(groups));
    
    syncToCloud();
    renderGroupList();
    updateDisplay();
  }
};

window.sendChat = () => {
  const nameInput = document.getElementById('chatName');
  const msgInput = document.getElementById('chatMessage');
  const name = nameInput.value || '名無し';
  const msg = msgInput.value;
  if (msg) {
    push(chatRef, { name: name, text: msg, time: now() });
    msgInput.value = '';
  }
};

// 指定した団体番号で開始する（管理者用）
window.startGroup = (newIndex) => {
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  if (newIndex >= groups.length) return;
  
  localStorage.setItem('currentIndex', newIndex);
  localStorage.setItem('startTime', now()); // 実際の開始時刻
  
  // 最初の団体なら基準時刻もセット
  if (newIndex === 0) {
      localStorage.setItem('firstGroupStartTime', now());
  }
  
  localStorage.setItem('callActive', 'false');
  syncToCloud();
};

// =========================================================
//  起動時の処理
// =========================================================
document.addEventListener('DOMContentLoaded', () => {

  setInterval(updateDisplay, 500);

  const chatArea = document.getElementById('chatArea');
  onChildAdded(chatRef, (snapshot) => {
    const msg = snapshot.val();
    const div = document.createElement('div');
    div.style.marginBottom = '5px';
    div.style.borderBottom = '1px solid #333';
    div.style.padding = '5px';
    const timeStr = new Date(msg.time).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `<span style="color:#888; font-size:0.8rem;">${timeStr}</span> <strong>${msg.name}:</strong> ${msg.text}`;
    if (chatArea) chatArea.prepend(div);
  });

  // ★重要: Firebaseのデータを常に正としてローカルを上書き
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      if (data.groups) localStorage.setItem('groups', JSON.stringify(data.groups));
      
      // 数値型データは確実に保存
      localStorage.setItem('currentIndex', (data.currentIndex !== undefined) ? data.currentIndex : -1);
      localStorage.setItem('startTime', (data.startTime !== undefined) ? data.startTime : 0);
      localStorage.setItem('firstGroupStartTime', (data.firstGroupStartTime !== undefined) ? data.firstGroupStartTime : 0);
      
      localStorage.setItem('callActive', data.callActive);
      
      renderGroupList();
      updateDisplay();
    }
  });

  const sendBtn = document.getElementById('sendChatBtn');
  if (sendBtn) sendBtn.onclick = window.sendChat;

  // --- 管理者専用エリア ---
  const adminPanel = document.getElementById('adminPanel');
  const clearChatBtn = document.getElementById('clearChatBtn');

  if (isAdmin) {
    if (adminPanel) adminPanel.classList.remove('hidden');
    if (clearChatBtn) clearChatBtn.classList.remove('hidden');

    const addBtn = document.getElementById('addBtn');
    if (addBtn) addBtn.onclick = window.addGroup;

    if (clearChatBtn) {
      clearChatBtn.onclick = () => {
        if(confirm('チャット履歴を全て削除しますか？')) {
          remove(chatRef);
          if(chatArea) chatArea.innerHTML = '';
        }
      };
    }

    const manualCallBtn = document.getElementById('manualCallBtn');
    if (manualCallBtn) {
      manualCallBtn.onclick = () => {
        const current = localStorage.getItem('callActive') === 'true';
        localStorage.setItem('callActive', !current);
        syncToCloud();
      };
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if(confirm('【危険】本当に全データをリセットしますか？\n（リハーサル後や、最初からやり直す場合のみ）')){
          set(dbRef, null);
          remove(chatRef);
          localStorage.clear();
          location.reload();
        }
      };
    }

    const startFirstBtn = document.getElementById('startFirst');
    if (startFirstBtn) {
      startFirstBtn.onclick = () => {
        const gs = JSON.parse(localStorage.getItem('groups') || '[]');
        if (!gs.length) return alert("団体が登録されていません");
        
        if(confirm('最初の団体からスタートしますか？（ここがスケジュールの基準点になります）')){
            window.startGroup(0);
        }
      };
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        const n = parseInt(localStorage.getItem('currentIndex') || '-1') + 1;
        const groups = JSON.parse(localStorage.getItem('groups') || '[]');
        if (n < groups.length) window.startGroup(n);
        else alert("全ての演目が終了しました");
      };
    }

  } else {
    if (adminPanel) adminPanel.classList.add('hidden');
    if (clearChatBtn) clearChatBtn.classList.add('hidden');
  }
  
  renderGroupList();
  updateDisplay();
});