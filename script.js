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

// データを完全に分離・同期するためのデータベース参照
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
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
};
const formatDiff = (diffMs) => {
  const abs = Math.abs(diffMs);
  return `${diffMs >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60000))}:${pad(Math.floor((abs % 60000) / 1000))}`;
};

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  if (isAdmin) {
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('clearChatBtn').style.display = 'block';
  }

  // 1. チャットのリアルタイム受信（完全同期版）
  onValue(chatRef, (snapshot) => {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    
    chatArea.innerHTML = ''; // 画面をリセット
    const messages = [];
    
    snapshot.forEach((childSnapshot) => {
      messages.push(childSnapshot.val());
    });

    // メッセージを描画
    messages.forEach((msg) => {
      const div = document.createElement('div');
      div.className = 'chat-message-row';
      
      const timeStr = new Date(msg.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      
      div.innerHTML = `
        <span class="chat-time">${timeStr}</span>
        <span class="chat-name">${msg.name}</span>
        <span class="chat-text">${msg.text}</span>
      `;
      chatArea.appendChild(div);
    });
    
    // 自動で一番下（最新）にスクロール
    chatArea.scrollTop = chatArea.scrollHeight;
  });

  // 2. タイマー進行状態のリアルタイム受信
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      localStorage.setItem('groups', JSON.stringify(data.groups || []));
      localStorage.setItem('currentIndex', data.currentIndex !== undefined ? data.currentIndex : -1);
      localStorage.setItem('startTime', data.startTime || 0);
      localStorage.setItem('firstGroupStartTime', data.firstGroupStartTime || 0);
      localStorage.setItem('endTime', data.endTime || 0);
      localStorage.setItem('callActive', data.callActive === true ? 'true' : 'false');
      
      renderGroupList();
      updateDisplay();
    }
  });

  // 画面の定期更新 (1秒間に2回)
  setInterval(updateDisplay, 500);

  // --- チャット送信処理 ---
  const sendChatBtn = document.getElementById('sendChatBtn');
  const chatMsgInput = document.getElementById('chatMsg');
  
  const sendMessage = () => {
    const text = chatMsgInput.value.trim();
    const name = document.getElementById('chatName').value.trim() || '名無し';
    
    if (text !== '') {
      push(chatRef, { name, text, time: now() });
      chatMsgInput.value = ''; // 送信後に枠を空にする
    }
  };

  if (sendChatBtn) sendChatBtn.onclick = sendMessage;
  if (chatMsgInput) {
    chatMsgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // --- 管理者用イベント設定 ---
  if (isAdmin) {
    // 団体追加
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

    // 呼び出しアラート手動切り替え
    document.getElementById('manualCallBtn').onclick = () => {
      const current = localStorage.getItem('callActive') === 'true';
      localStorage.setItem('callActive', !current ? 'true' : 'false');
      syncToCloud();
    };

    // チャット履歴削除
    document.getElementById('clearChatBtn').onclick = () => {
      if(confirm('チャット履歴を全て削除しますか？全員の画面から消えます。')) {
        remove(chatRef);
      }
    };

    // 全データリセット
    document.getElementById('clearBtn').onclick = () => {
      if(confirm('【危険】本当に全データをリセットしますか？')){
        set(dbRef, null);
        remove(chatRef);
        localStorage.clear();
        location.reload();
      }
    };

    // 進行コントロール
    document.getElementById('startFirst').onclick = () => {
      const gs = JSON.parse(localStorage.getItem('groups') || '[]');
      if (!gs.length) return alert("団体が登録されていません");
      if(confirm('最初の団体からスタートしますか？')) window.startGroup(0);
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
          localStorage.setItem('endTime', now());
          localStorage.setItem('callActive', 'false');
          syncToCloud();
          updateDisplay();
        }
      }
    };
  }
});

// クラウドへ状態を保存（同期元）
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

// 演目スタート処理
window.startGroup = (newIndex) => {
  localStorage.setItem('currentIndex', newIndex);
  localStorage.setItem('startTime', now());
  if (newIndex === 0) {
    localStorage.setItem('firstGroupStartTime', now());
    localStorage.setItem('endTime', 0);
  }
  localStorage.setItem('callActive', 'false'); // 次に進むとアラートは自動で消す
  syncToCloud();
};

// 画面の表示更新処理
function updateDisplay() {
  const groups = JSON.parse(localStorage.getItem('groups') || '[]');
  const idx = parseInt(localStorage.getItem('currentIndex') || '-1');
  const startTime = parseInt(localStorage.getItem('startTime') || '0');
  const firstGroupStartTime = parseInt(localStorage.getItem('firstGroupStartTime') || '0');
  const callActive = localStorage.getItem('callActive') === 'true';

  // 総スケジュールの計算
  const schedEl = document.getElementById('stageSchedule');
  let totalMinutes = groups.reduce((sum, g) => sum + g.minutes, 0);
  if (firstGroupStartTime > 0) {
    const endD = new Date(firstGroupStartTime + totalMinutes * 60000);
    const startD = new Date(firstGroupStartTime);
    schedEl.textContent = `Schedule: ${pad(startD.getHours())}:${pad(startD.getMinutes())} - ${pad(endD.getHours())}:${pad(endD.getMinutes())} (計${totalMinutes}分)`;
  } else {
    schedEl.textContent = `Total: ${totalMinutes} min`;
  }

  // ★ 呼び出しアラートの表示制御（CSSに頼らずJSで強制的に切り替え）★
  const alertBox = document.getElementById('callAlert');
  if (alertBox) {
    if (callActive) {
      alertBox.style.display = 'block';
    } else {
      alertBox.style.display = 'none';
    }
  }

  const currentGroupEl = document.getElementById('currentGroup');
  const timerEl = document.getElementById('mainTimer');
  const statusEl = document.getElementById('statusBadge');
  const diffEl = document.getElementById('diffTime');
  const nextGroupEl = document.getElementById('nextGroupName');
  const nextPrepEl = document.getElementById('nextPrepareMsg');

  // 全終了状態
  if (idx === groups.length && groups.length > 0) {
    if (currentGroupEl) currentGroupEl.textContent = "🎉 全演目終了";
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#fff"; }
    
    const endTime = parseInt(localStorage.getItem('endTime') || '0');
    if (firstGroupStartTime > 0 && endTime > 0) {
      let idealElapsed = totalMinutes * 60000;
      const diff = endTime - (firstGroupStartTime + idealElapsed);

      if (diffEl) {
        diffEl.textContent = formatDiff(diff);
        diffEl.style.color = diff > 60000 ? '#ff3b30' : (diff < -60000 ? '#00e5ff' : '#4caf50');
      }
      if (statusEl) {
        statusEl.textContent = diff > 60000 ? '全体押し' : (diff < -60000 ? '全体巻き' : '予定通り');
        statusEl.style.color = diff > 60000 ? '#ff3b30' : (diff < -60000 ? '#00e5ff' : '#4caf50');
      }
    }
    if (nextGroupEl) nextGroupEl.textContent = "なし";
    if (nextPrepEl) nextPrepEl.style.display = 'none';
  } 
  // 進行中
  else if (idx >= 0 && idx < groups.length) {
    const g = groups[idx];
    if (currentGroupEl) currentGroupEl.textContent = g.name;

    const remaining = (g.minutes * 60000) - (now() - startTime);

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.style.color = remaining < 0 ? '#ff3b30' : (remaining < 60000 ? '#ffcc00' : '#fff'); 
    }

    if (firstGroupStartTime > 0 && firstGroupStartTime <= now()) {
      let idealElapsed = 0;
      for (let i = 0; i < idx; i++) idealElapsed += groups[i].minutes * 60000;
      const diff = startTime - (firstGroupStartTime + idealElapsed);

      if (diffEl) {
        diffEl.textContent = formatDiff(diff);
        diffEl.style.color = diff > 60000 ? '#ff3b30' : (diff < -60000 ? '#00e5ff' : '#4caf50');
      }
      if (statusEl) {
        statusEl.textContent = diff > 60000 ? '押し' : (diff < -60000 ? '巻き' : '順調');
        statusEl.style.color = diff > 60000 ? '#ff3b30' : (diff < -60000 ? '#00e5ff' : '#4caf50');
      }
    }

    // 時間切れ自動送り
    if (isAdmin && remaining <= 0) {
      const autoCheck = document.getElementById('autoAdvance');
      if (autoCheck && autoCheck.checked && remaining < -2000) window.startGroup(idx + 1); 
    }
  } 
  // 待機中
  else {
    if (currentGroupEl) currentGroupEl.textContent = "---";
    if (timerEl) { timerEl.textContent = "--:--"; timerEl.style.color = "#fff"; }
    if (diffEl) { diffEl.textContent = "±00:00"; diffEl.style.color = "#fff"; }
    if (statusEl) { statusEl.textContent = "待機中"; statusEl.style.color = "#fff"; }
  }

  // Next表示制御
  if (idx >= 0 && idx < groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = groups[idx + 1].name;
    const currentRem = (groups[idx].minutes * 60000) - (now() - startTime);
    // 残り3分(180000ms)を切ったら(準備!)を表示
    if (nextPrepEl) nextPrepEl.style.display = currentRem < 180000 ? 'inline' : 'none';
  } else if (idx === groups.length - 1) {
    if (nextGroupEl) nextGroupEl.textContent = "(全日程終了へ)";
    if (nextPrepEl) nextPrepEl.style.display = 'none';
  }

  // リストのハイライト更新
  const rows = document.querySelectorAll('#groupsTable tbody tr');
  rows.forEach((tr, i) => i === idx ? tr.classList.add('current-row') : tr.classList.remove('current-row'));
}

// リスト描画処理
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
    tr.innerHTML = `<td class="col-num">${i+1}</td><td class="col-name">${g.name}</td><td class="col-time">${g.minutes}分</td><td class="col-action">${actionHtml}</td>`;
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