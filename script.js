import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// 端末間の時計ズレ補正（サーバー時刻）
let serverTimeOffset = 0;
const offsetRef = ref(db, ".info/serverTimeOffset");
onValue(offsetRef, (snap) => {
  serverTimeOffset = snap.val() || 0;
});
function getSyncedTime() {
  return Date.now() + serverTimeOffset;
}

const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('id');
const isAdmin = urlParams.get('pw') === 'seito';

let dbRef, chatRef; 

// 唯一の正しい進行データ
let currentStageData = {
  groups: [],
  currentIndex: -1,
  startTime: 0,
  firstGroupStartTime: 0,
  endTime: 0,
  callActive: false
};

let lastAutoAdvancedIndex = -1;

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

  if (!eventId) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginIsAdmin').addEventListener('change', (e) => {
      const pwInput = document.getElementById('loginAdminPw');
      if(e.target.checked) pwInput.classList.remove('hidden');
      else pwInput.classList.add('hidden');
    });

    document.getElementById('loginBtn').addEventListener('click', () => {
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

  document.getElementById('roomNameDisplay').textContent = `Room: ${eventId}`;
  dbRef = ref(db, `events/${eventId}/stageData`);
  chatRef = ref(db, `events/${eventId}/chatMessages`);
  
  startApp();
});

function updateCloud(newData) {
  if (!isAdmin) return;
  set(dbRef, newData).catch(err => {
    console.error("データの同期に失敗しました", err);
    alert("通信エラーが発生しました。リロードしてください。");
  });
}

function startApp() {
  setInterval(updateDisplay, 500);

  // 設定パネル
  document.getElementById('openSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('closeSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('hidden');
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = (e) => { localStorage.setItem(themeKey, e.target.getAttribute('data-theme')); applyTheme(); };
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

  // ==========================================
  // ★完璧に再構築したスマートチャットシステム
  // ==========================================
  const chatArea = document.getElementById('chatArea');
  let isUserScrolling = false;

  // ユーザーが過去を読んでいるかを検知（上から10px以上スクロールしているか）
  if (chatArea) {
    chatArea.addEventListener('scroll', () => {
      isUserScrolling = chatArea.scrollTop > 10;
    });
  }

  // クラッシュ防止：最新の100件だけを取得するセーフティネット
  const safeChatQuery = query(chatRef, limitToLast(100));

  onValue(safeChatQuery, (snapshot) => {
    if (!chatArea) return;
    
    // 更新前のスクロール状態を記憶
    const previousScrollHeight = chatArea.scrollHeight;
    const previousScrollTop = chatArea.scrollTop;

    if (!snapshot.exists()) {
      chatArea.innerHTML = ''; 
      return;
    }

    const messages = [];
    snapshot.forEach((childSnap) => { messages.push(childSnap.val()); });

    // 描画負荷を極限まで下げるDocumentFragment
    const fragment = document.createDocumentFragment();

    // ★最新が一番上になるように反転
    messages.reverse().forEach((msg) => {
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      div.style.borderBottom = '1px solid rgba(128,128,128,0.3)';
      div.style.paddingBottom = '5px';
      
      const timeSpan = document.createElement('span');
      timeSpan.style.fontSize = '0.8rem';
      timeSpan.style.opacity = '0.6';
      
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
      fragment.appendChild(div); // 画面に直接ではなく透明な箱に追加
    });

    chatArea.innerHTML = ''; 
    chatArea.appendChild(fragment); // 一気に画面へ反映（チラつき防止）

    // ★UX保護：スマートスクロール発動
    if (!isUserScrolling) {
      // トップにいる時はそのまま最新（一番上）を見せる
      chatArea.scrollTop = 0;
    } else {
      // 過去を読んでいる最中は、新着が上に入った「高さの差分」だけスクロール位置をズラし、
      // ユーザーの視界を1ミリも動かさない
      chatArea.scrollTop = previousScrollTop + (chatArea.scrollHeight - previousScrollHeight);
    }
  });
  // ==========================================

  // タイマー進行データの同期
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      currentStageData = {
        groups: data.groups || [],
        currentIndex: data.currentIndex ?? -1,
        startTime: data.startTime ?? 0,
        firstGroupStartTime: data.firstGroupStartTime ?? 0,
        endTime: data.endTime ?? 0,
        callActive: data.callActive ?? false
      };
    } else {
      currentStageData = { groups: [], currentIndex: -1, startTime: 0, firstGroupStartTime: 0, endTime: 0, callActive: false };
      lastAutoAdvancedIndex = -1;
    }
    renderGroupList();
    updateDisplay();
  });

  const sendBtn = document.getElementById('sendChatBtn');
  const msgInput = document.getElementById('chatMessage');
  
  const sendMessage = () => {
    const text = msgInput.value.trim();
    if (text) {
      push(chatRef, { 
        name: document.getElementById('chatName').value.trim() || '名無し', 
        text: text, 
        time: getSyncedTime() 
      });
      msgInput.value = '';
      
      // ★自分が送信した時は、過去を読んでいても強制的に一番上（最新）に戻してあげる
      if (chatArea) chatArea.scrollTop = 0;
    }
  };

  if (sendBtn) sendBtn.onclick = sendMessage;
  if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
      // スマホ変換確定時の暴発防止と、Enter送信の両立
      if (e.key === 'Enter' && !e.isComposing) { 
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
      const name = document.getElementById('groupInput').value.trim();
      const mins = parseInt(document.getElementById('minutesInput').value);
      
      if (!name) return alert("団体名を入力してください");
      if (isNaN(mins) || mins <= 0) return alert("持ち時間は1以上の正しい数字を入力してください");

      const newData = { ...currentStageData };
      newData.groups = [...newData.groups, { name: name, minutes: mins }];
      updateCloud(newData);
      document.getElementById('groupInput').value = '';
    };

    document.getElementById('clearChatBtn').onclick = () => {
        if(confirm('チャット履歴を全て削除しますか？')) { set(chatRef, null); }
    };

    document.getElementById('manualCallBtn').onclick = () => {
        const newData = { ...currentStageData };
        newData.callActive = !newData.callActive;
        updateCloud(newData);
    };

    document.getElementById('clearBtn').onclick = () => {
        if(confirm(`【危険】全データをリセットしますか？\n(全ての端末でデータが消去されます)`)){ 
            const initialState = { groups: [], currentIndex: -1, startTime: 0, firstGroupStartTime: 0, endTime: 0, callActive: false };
            set(dbRef, initialState);
            set(chatRef, null); 
        }
    };

    document.getElementById('startFirst').onclick = () => {
        if (!currentStageData.groups.length) return alert("団体がありません");
        if(confirm('最初の団体からスタートしますか？')){ startGroupIdx(0); }
    };

    document.getElementById('nextBtn').onclick = () => {
        const nextIdx = currentStageData.currentIndex + 1;
        if (nextIdx < currentStageData.groups.length) {
            startGroupIdx(nextIdx);
        } else if (nextIdx === currentStageData.groups.length) {
            if (confirm("全ての演目を終了しますか？")) {
                const newData = { ...currentStageData };
                newData.currentIndex = nextIdx;
                newData.endTime = getSyncedTime();
                updateCloud(newData);
            }
        }
    };
  } else {
    if (adminPanel) adminPanel.classList.add('hidden');
  }
}

function startGroupIdx(newIndex) {
  const newData = { ...currentStageData };
  newData.currentIndex = newIndex;
  newData.startTime = getSyncedTime();
  if (newIndex === 0) {
      newData.firstGroupStartTime = newData.startTime;
      newData.endTime = 0;
  }
  newData.callActive = false;
  updateCloud(newData);
}

window.insertGroup = (index) => {
  const name = prompt("上に挿入する団体名を入力:");
  if (!name || !name.trim()) return;
  const minsStr = prompt("持ち時間(分)を入力:", "5");
  const mins = parseInt(minsStr);
  if (isNaN(mins) || mins <= 0) return alert("正しい時間を入力してください");

  const newData = { ...currentStageData };
  const newGroups = [...newData.groups];
  newGroups.splice(index, 0, { name: name.trim(), minutes: mins });
  newData.groups = newGroups;
  updateCloud(newData);
};

window.deleteGroup = (index) => {
  if (confirm('この団体を削除しますか？')) {
    const newData = { ...currentStageData };
    const newGroups = [...newData.groups];
    newGroups.splice(index, 1);
    newData.groups = newGroups;
    updateCloud(newData);
  }
};

const pad = (n) => n.toString().padStart(2, '0');
const formatTime = (ms) => {
  if (ms < 0) ms = 0;
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
};
const formatDiff = (diffMs) => {
  const abs = Math.abs(diffMs);
  return `${diffMs >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60000))}:${pad(Math.floor((abs % 60000) / 1000))}`;
};

function updateDisplay() {
  const { groups, currentIndex: idx, startTime, firstGroupStartTime, endTime, callActive } = currentStageData;

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
    if (timerEl) { timerEl.textContent = "00:00"; timerEl.style.color = "#fff"; timerEl.style.opacity = "1"; }
    
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

    const remaining = (g.minutes * 60000) - (getSyncedTime() - startTime);

    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.style.color = remaining < 0 ? '#ff3b30' : (remaining < 60000 ? '#ffcc00' : ''); 
      timerEl.style.opacity = "1";
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
      if (autoCheck && autoCheck.checked && remaining < -2000) {
        if (lastAutoAdvancedIndex !== idx) {
            lastAutoAdvancedIndex = idx;
            startGroupIdx(idx + 1);
        }
      }
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
  const { groups } = currentStageData;
  
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