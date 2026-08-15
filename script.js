const screen = document.getElementById("screen");
const progressFill = document.getElementById("progressFill");
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");

const QUESTION_COUNT = 8;

const state = {
  step: "boot",
  questionIndex: 0,
  rating: 0,
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
  q6: "",
  q6Detail: "",
  q6DevelopOpen: false,
  q6DevelopDecision: "",
  q7: "",
  q8: "",
  hiddenRewardShown: false,
  whiteoutShown: false,
};

const reportItems = [
  { title: "Localização registrada", subtitle: "Museu Ipiranga confirmado como cenário", status: "✓" },
  { title: "Primeiro encontro detectado", subtitle: "Sessão inicial recuperada da memória", status: "✓" },
  { title: "Cinema analisado", subtitle: "Filme, reações e proximidade registrados", status: "✓" },
  { title: "Caminhada detectada", subtitle: "Percurso contínuo após o cinema", status: "✓" },
  { title: "Conversas longas detectadas", subtitle: "Duração acima da média", status: "✓" },
  { title: "Compatibilidade musical", subtitle: "Calculando sugestões de trilha", status: "→" },
  { title: "Recomendações sincronizadas", subtitle: "Sessão alinhada", status: "✓" },
  { title: "Compatibilidade Letterboxd", subtitle: "Calculando afinidade", status: "→" },
  { title: "Reviews analisadas", subtitle: "Traços de gosto identificados", status: "✓" },
  { title: "Risadas detectadas", subtitle: "Várias ocorrências", status: "✓" },
  { title: "Silêncios constrangedores", subtitle: "Não encontrados", status: "✓" },
  { title: "Nível de conforto", subtitle: "Muito alto", status: "✓" },
  { title: "Tempo de qualidade", subtitle: "Registrado", status: "✓" },
];

let audioContext;
let renderTimers = [];
let confettiRAF = null;
let confettiParticles = [];

function setProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  progressFill.style.width = `${clamped}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clearTimers() {
  renderTimers.forEach((timer) => window.clearTimeout(timer));
  renderTimers = [];
}

function queue(fn, delay) {
  const timer = window.setTimeout(fn, delay);
  renderTimers.push(timer);
  return timer;
}

function wrap(content) {
  screen.classList.remove("screen--enter");
  screen.classList.add("screen--exit");

  window.clearTimeout(state.renderTimeout);
  state.renderTimeout = window.setTimeout(() => {
    screen.innerHTML = content;
    screen.classList.remove("screen--exit");
    screen.classList.add("screen--enter");
    bindScreen();
  }, 180);
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone({ type = "sine", frequency = 440, duration = 0.08, gain = 0.06, sweep = 0 } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  if (sweep) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + sweep), ctx.currentTime + duration);
  }
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration + 0.02);
}

function playClick() {
  playTone({ type: "triangle", frequency: 420, duration: 0.05, gain: 0.04, sweep: 50 });
}

function playDing() {
  playTone({ type: "sine", frequency: 784, duration: 0.12, gain: 0.08, sweep: 220 });
  queue(() => playTone({ type: "sine", frequency: 988, duration: 0.18, gain: 0.05, sweep: 120 }), 55);
}

function playRewardSound() {
  [
    { frequency: 523.25, delay: 0 },
    { frequency: 659.25, delay: 50 },
    { frequency: 783.99, delay: 100 },
    { frequency: 987.77, delay: 160 },
  ].forEach((note) => {
    queue(() => playTone({ type: "square", frequency: note.frequency, duration: 0.08, gain: 0.03, sweep: 60 }), note.delay);
  });
}

function setActiveQuestionButtonState() {
  const nextButton = screen.querySelector("[data-action='next']");
  if (nextButton) {
    nextButton.disabled = !canAdvanceQuestion(state.questionIndex);
  }
}

function canAdvanceQuestion(index) {
  if (index === 0) return Boolean(state.q1);
  if (index === 1) return state.q2.trim().length > 0;
  if (index === 2) return state.q3.trim().length > 0;
  if (index === 3) return state.q4.trim().length > 0;
  if (index === 4) return state.q5.trim().length > 0;
  if (index === 5) return Boolean(state.q6) && (state.q6DevelopDecision !== "Sim" || state.q6Detail.trim().length > 0);
  if (index === 6) return Boolean(state.q7);
  if (index === 7) return state.q8.trim().length > 0;
  return false;
}

function setRatingButtonState() {
  const finish = screen.querySelector("[data-action='finish-session']");
  if (finish) {
    finish.disabled = !state.rating;
  }
}

function renderBoot() {
  setProgress(0);
  wrap(`
    <div class="status-card boot-card">
      <span class="eyebrow">Atualização do aplicativo</span>
      <h1 class="title title--green">Verificando atualizações...</h1>
      <p class="subtitle">Atualização encontrada. Instalando a Versão 2.0...</p>
      <div class="panel">
        <div class="progress-line">
          <span>Verificando atualizações...</span>
          <strong id="bootPercent">0%</strong>
        </div>
        <div class="mini-loader"><span id="bootBar"></span></div>
      </div>
      <div class="log-list" id="bootLog">
        <div class="log-item">
          <div class="log-title">Verificando atualizações...</div>
          <div class="log-subtitle">Lendo pacotes instalados</div>
        </div>
      </div>
    </div>
  `);

  const bootBar = document.getElementById("bootBar");
  const bootPercent = document.getElementById("bootPercent");
  const bootLog = document.getElementById("bootLog");
  const phases = [
    { title: "Verificando atualizações...", subtitle: "Lendo pacotes instalados", value: 18, wait: 480 },
    { title: "Atualização encontrada.", subtitle: "Pacote da Versão 2.0 localizado", value: 62, wait: 1800 },
    { title: "Instalando a Versão 2.0...", subtitle: "Aplicando refinamentos de interface", value: 100, wait: 920 },
  ];

  let delay = 180;
  phases.forEach((phase) => {
    delay += phase.wait;
    queue(() => {
      if (bootBar) bootBar.style.width = `${phase.value}%`;
      if (bootPercent) bootPercent.textContent = `${phase.value}%`;
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `
        <div class="log-title">${phase.title}</div>
        <div class="log-subtitle">${phase.subtitle}</div>
      `;
      bootLog.appendChild(item);
      playClick();
    }, delay);
  });

  queue(() => renderHome(), delay + 820);
}

function renderHome() {
  setProgress(0);
  wrap(`
    <div class="status-card">
      <span class="eyebrow">Version 2.0</span>
      <h1 class="title title--red">Ipiranga Update</h1>
      <p class="subtitle">Uma nova sessão foi detectada.</p>
      <div class="actions">
        <button class="btn btn--green" data-action="start">▶ Iniciar análise</button>
      </div>
    </div>
  `);
}

function renderAnalysis() {
  setProgress(5);
  wrap(`
    <div class="status-card analysis-card">
      <span class="eyebrow">Análise da sessão</span>
      <h2 class="title title--red">Analisando os registros da sessão...</h2>
      <p class="body">Conectando... Sincronizando memórias... Lendo registros do primeiro encontro... Analisando a sessão inteira...</p>
      <div class="panel">
        <div class="progress-line">
          <span id="analysisLabel">Conectando...</span>
          <strong id="analysisPercent">5%</strong>
        </div>
        <div class="mini-loader"><span id="analysisBar"></span></div>
      </div>
      <div class="log-list" id="analysisLog"></div>
    </div>
  `);

  const analysisBar = document.getElementById("analysisBar");
  const analysisPercent = document.getElementById("analysisPercent");
  const analysisLabel = document.getElementById("analysisLabel");
  const analysisLog = document.getElementById("analysisLog");
  const phases = [
    { label: "Conectando...", value: 12, wait: 1100 },
    { label: "Sincronizando memórias...", value: 24, wait: 740 },
    { label: "Lendo registros...", value: 42, wait: 780 },
    { label: "Recuperando o primeiro encontro...", value: 58, wait: 860 },
    { label: "Validando a sessão no cinema...", value: 74, wait: 900 },
    { label: "Analisando reações, caminhada e conversa...", value: 90, wait: 920 },
    { label: "Compilando relatório...", value: 100, wait: 980 },
  ];

  let delay = 180;
  phases.forEach((phase, index) => {
    delay += phase.wait;
    queue(() => {
      if (analysisBar) analysisBar.style.width = `${phase.value}%`;
      if (analysisPercent) analysisPercent.textContent = `${phase.value}%`;
      if (analysisLabel) analysisLabel.textContent = phase.label;

      if (index < reportItems.length) {
        const item = document.createElement("div");
        item.className = "log-item";
        item.innerHTML = `
          <div class="log-title">${escapeHtml(reportItems[index].title)}</div>
          <div class="log-subtitle">${escapeHtml(reportItems[index].subtitle)}</div>
          <div class="log-status ${index === 3 || index === 5 ? "is-warn" : ""}">${reportItems[index].status}</div>
        `;
        analysisLog.appendChild(item);
      }
      playClick();
    }, delay);
  });

  queue(() => renderContinuar(), delay + 1400);
}

function renderContinuar() {
  setProgress(20);
  wrap(`
    <div class="status-card">
      <span class="eyebrow">Análise concluída</span>
      <h2 class="title title--red">Análise concluída.</h2>
      <p class="body">Algumas informações não puderam ser determinadas automaticamente.<br>A ajuda externa da participante é necessária.</p>
      <div class="panel">
        <div class="log-list">
          <div class="log-item">
            <div class="log-title">Algumas informações não puderam ser determinadas automaticamente.</div>
            <div class="log-subtitle">O sistema precisa de respostas subjetivas para continuar.</div>
          </div>
          <div class="log-item">
            <div class="log-title">Leitura principal concluída</div>
            <div class="log-subtitle">Preparando a interface do questionário</div>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn--green" data-action="continue">Continuar</button>
      </div>
    </div>
  `);
}

function renderQuestion(index) {
  state.questionIndex = index;
  setProgress(Math.round(((index + 1) / (QUESTION_COUNT + 1)) * 100));

  const templates = [
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 1</span>
        <h2 class="title title--red">Qual encontro você gostou mais?</h2>
        <div class="choice-grid">
          <button class="option-btn ${state.q1 === "Cinema" ? "is-selected" : ""}" data-action="choice" data-field="q1" data-value="Cinema">🎬 Cinema</button>
          <button class="option-btn ${state.q1 === "Museu Ipiranga" ? "is-selected" : ""}" data-action="choice" data-field="q1" data-value="Museu Ipiranga">🏛 museu ipiranga</button>
        </div>
        <div class="actions">
          <button class="btn btn--green" data-action="next">Próxima</button>
        </div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 2</span>
        <h2 class="title title--green">Se pudesse reviver um momento de hoje, qual seria?</h2>
        <textarea class="field" data-field="q2" placeholder="Escreva aqui...">${escapeHtml(state.q2)}</textarea>
        <div class="actions"><button class="btn btn--green" data-action="next">Próxima</button></div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 3</span>
        <h2 class="title title--red">Qual foi a melhor parte do dia?</h2>
        <textarea class="field" data-field="q3" placeholder="Escreva aqui...">${escapeHtml(state.q3)}</textarea>
        <div class="actions"><button class="btn btn--red" data-action="next">Próxima</button></div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 4</span>
        <h2 class="title title--green">Qual foi a primeira palavra que veio à sua cabeça quando olhou para mim hoje?</h2>
        <textarea class="field" data-field="q4" placeholder="Escreva aqui...">${escapeHtml(state.q4)}</textarea>
        <div class="actions"><button class="btn btn--green" data-action="next">Próxima</button></div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 5</span>
        <h2 class="title title--red">Se nosso dia tivesse uma trilha sonora, qual seria?</h2>
        <textarea class="field" data-field="q5" placeholder="Escreva aqui...">${escapeHtml(state.q5)}</textarea>
        <div class="actions"><button class="btn btn--red" data-action="next">Próxima</button></div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 6</span>
        <h2 class="title title--green">Você descobriu alguma coisa nova sobre mim hoje?</h2>
        <div class="choice-grid">
          <button class="option-btn ${state.q6 === "Sim" ? "is-selected" : ""}" data-action="choice" data-field="q6" data-value="Sim">Sim</button>
          <button class="option-btn ${state.q6 === "Muitas coisas" ? "is-selected" : ""}" data-action="choice" data-field="q6" data-value="Muitas coisas">Muitas coisas</button>
          <button class="option-btn ${state.q6 === "Ainda estou processando" ? "is-selected" : ""}" data-action="choice" data-field="q6" data-value="Ainda estou processando">Ainda estou processando</button>
        </div>
        <div class="actions">
          <button class="btn btn--green" data-action="toggle-develop" ${state.q6 ? "" : "disabled"}>Deseja desenvolver sua resposta?</button>
        </div>
        <div class="${state.q6DevelopOpen ? "" : "hidden"}">
          <div class="choice-grid choice-grid--compact">
            <button class="option-btn ${state.q6DevelopDecision === "Sim" ? "is-selected" : ""}" data-action="develop-choice" data-value="Sim">Sim</button>
            <button class="option-btn ${state.q6DevelopDecision === "Não" ? "is-selected" : ""}" data-action="develop-choice" data-value="Não">Não</button>
          </div>
        </div>
        <div class="question-followup ${state.q6DevelopDecision === "Sim" ? "" : "hidden"}">
          <textarea class="field" data-field="q6Detail" placeholder="Desenvolva sua resposta aqui...">${escapeHtml(state.q6Detail)}</textarea>
        </div>
        <div class="actions ${state.q6DevelopDecision === "Sim" ? "" : "hidden"}">
          <button class="btn btn--green" data-action="next">Próxima</button>
        </div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 7</span>
        <h2 class="title title--red">Depois de hoje, você sente que me conhece melhor?</h2>
        <div class="choice-grid">
          <button class="option-btn ${state.q7 === "Sim" ? "is-selected" : ""}" data-action="choice" data-field="q7" data-value="Sim">Sim</button>
          <button class="option-btn ${state.q7 === "Bastante" ? "is-selected" : ""}" data-action="choice" data-field="q7" data-value="Bastante">Bastante</button>
          <button class="option-btn ${state.q7 === "Um pouquinho" ? "is-selected" : ""}" data-action="choice" data-field="q7" data-value="Um pouquinho">Um pouquinho</button>
        </div>
        <div class="actions">
          <button class="btn btn--red" data-action="next">Próxima</button>
        </div>
      </div>
    `,
    `
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta 8</span>
        <h2 class="title title--green">Tem alguma coisa que você ficou com vontade de me perguntar e ainda não perguntou?</h2>
        <textarea class="field" data-field="q8" placeholder="Escreva aqui...">${escapeHtml(state.q8)}</textarea>
        <div class="actions"><button class="btn btn--green" data-action="next">Próxima</button></div>
      </div>
    `,
  ];

  wrap(templates[index]);
}

function renderRating() {
  setProgress(100);
  wrap(`
      <div class="status-card question-card">
        <span class="eyebrow">Pergunta final</span>
        <h2 class="title title--red">Se esta sessão do KritiquestionI tivesse uma nota...</h2>
        <div class="rating-stars" role="radiogroup" aria-label="Avaliação da sessão">
        ${[1, 2, 3, 4, 5]
          .map(
            (star) => `
              <button class="rating-star ${state.rating === star ? "is-selected" : ""} ${state.rating && state.rating !== star ? "is-faded" : ""}" data-action="rate" data-value="${star}" aria-label="${star} estrela${star > 1 ? "s" : ""}">⭐</button>
            `,
          )
          .join("")}
      </div>
      <div class="actions">
        <button class="btn btn--green" data-action="finish-session" ${state.rating ? "" : "disabled"}>Finalizar sessão</button>
      </div>
    </div>
  `);
}

function renderClosing() {
  setProgress(100);
  wrap(`
    <div class="status-card closing-card">
      <span class="eyebrow">Sequência final</span>
      <h2 class="title title--green">Salvando sessão...</h2>
      <p class="body">Atualizando a base de memória e compilando o registro completo do dia.</p>
      <div class="panel">
        <div class="progress-line">
          <span id="closingLabel">Salvando sessão...</span>
          <strong id="closingPercent">0%</strong>
        </div>
        <div class="mini-loader"><span id="closingBar"></span></div>
      </div>
      <div class="log-list" id="closingLog">
        <div class="log-item">
          <div class="log-title">Salvando sessão...</div>
          <div class="log-subtitle">Preparing final memory snapshot</div>
        </div>
      </div>
    </div>
  `);

  const closingBar = document.getElementById("closingBar");
  const closingPercent = document.getElementById("closingPercent");
  const closingLabel = document.getElementById("closingLabel");
  const closingLog = document.getElementById("closingLog");
  const phases = [
    { label: "Salvando sessão...", subtitle: "Writing answers to local memory", value: 24, wait: 520 },
    { label: "Atualizando a base de memória...", subtitle: "Registering new session data", value: 67, wait: 740 },
    { label: "Nova memória registrada.", subtitle: "Captura final confirmada", value: 100, wait: 920 },
  ];

  let delay = 220;
  phases.forEach((phase, index) => {
    delay += phase.wait;
    queue(() => {
      if (closingBar) closingBar.style.width = `${phase.value}%`;
      if (closingPercent) closingPercent.textContent = `${phase.value}%`;
      if (closingLabel) closingLabel.textContent = phase.label;
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `
        <div class="log-title">${phase.label}</div>
        <div class="log-subtitle">${phase.subtitle}</div>
      `;
      closingLog.appendChild(item);
      if (index > 0) playClick();
    }, delay);
  });

  queue(() => {
    renderFinal();
    queue(startRewardEasterEgg, 1800);
  }, delay + 900);
}

function renderFinal() {
  setProgress(100);
  wrap(`
    <div class="final-screen">
      <div class="final-card">
        <div class="final-copy">Obrigado por jogar mais uma sessão do KritiquestionI.</div>
        <div class="final-text">Sessão concluída com sucesso.</div>
        <div class="body">Até a próxima atualização.</div>
      </div>
    </div>
  `);
}

function startRewardEasterEgg() {
  if (state.hiddenRewardShown) return;
  state.hiddenRewardShown = true;

  const overlay = document.createElement("div");
  overlay.className = "overlay is-active";
  overlay.id = "rewardOverlay";
  overlay.innerHTML = `
    <div class="overlay-card">
      <span class="eyebrow secret-badge">Reconstruindo...</span>
      <h2>Procurando conteúdo oculto</h2>
      <p>Analisando conteúdo oculto... Buscando a sessão anterior... Sincronizando recompensas...</p>
      <div class="panel">
        <div class="progress-line">
          <span>Recompensa herdada da Versão 1.0.5</span>
          <strong id="rewardPercent">0%</strong>
        </div>
        <div class="mini-loader"><span id="rewardBar"></span></div>
      </div>
      <div class="log-list" id="rewardLog">
        <div class="log-item">
          <div class="log-title">Reconstruindo...</div>
          <div class="log-subtitle">Canais ocultos de memória online</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const rewardBar = overlay.querySelector("#rewardBar");
  const rewardPercent = overlay.querySelector("#rewardPercent");
  const rewardLog = overlay.querySelector("#rewardLog");

  playDing();
  playRewardSound();
  triggerConfetti();

  const phases = [
    { label: "Procurando conteúdo oculto...", subtitle: "Escaneando a camada da recompensa", value: 30, wait: 900 },
    { label: "Buscando a sessão anterior...", subtitle: "Procurando o estado herdado", value: 64, wait: 1100 },
    { label: "Save anterior encontrado.", subtitle: "Sincronizando recompensas", value: 100, wait: 1100 },
  ];

  let delay = 180;
  phases.forEach((phase, index) => {
    delay += phase.wait;
    queue(() => {
      if (rewardBar) rewardBar.style.width = `${phase.value}%`;
      if (rewardPercent) rewardPercent.textContent = `${phase.value}%`;
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `
        <div class="log-title">${phase.label}</div>
        <div class="log-subtitle">${phase.subtitle}</div>
      `;
      rewardLog.appendChild(item);
      if (index > 0) playClick();
    }, delay);
  });

  queue(() => {
    overlay.innerHTML = `
      <div class="overlay-card achievement">
        <div class="trophy">🏆</div>
        <div class="eyebrow secret-badge">Recompensa secreta</div>
        <h2>Desbloqueada</h2>
        <p>Recompensa oculta detectada.</p>
        <div class="actions">
          <button class="btn btn--green" data-action="claim-reward">Reivindicar recompensa</button>
        </div>
      </div>
    `;
    overlay.querySelector("[data-action='claim-reward']")?.addEventListener("click", handleClaimReward);
  }, delay + 1400);
}

function handleClaimReward() {
  playClick();
  document.getElementById("rewardOverlay")?.remove();
  renderClaimBlock();
}

function renderClaimBlock() {
  if (state.whiteoutShown) return;
  state.whiteoutShown = true;

  const whiteout = document.createElement("div");
  whiteout.className = "overlay is-active";
  whiteout.innerHTML = `
    <div class="overlay-card" style="text-align:center">
      <img src="KritiquestionI.png" alt="KritiQuestionI" class="brand__logo" style="margin:0 auto 12px;" />
      <p class="whiteout-text" id="whiteoutText"></p>
    </div>
  `;
  document.body.appendChild(whiteout);
  typeText(whiteout.querySelector("#whiteoutText"), "This reward must be delivered personally.");
}

function typeText(target, message) {
  if (!target) return;
  let index = 0;
  target.textContent = "";

  const step = () => {
    target.textContent = message.slice(0, index);
    if (index < message.length) {
      index += 1;
      queue(step, 42);
    }
  };

  step();
}

function triggerConfetti() {
  if (typeof window.confetti === "function") {
    window.confetti({
      particleCount: 160,
      spread: 90,
      startVelocity: 38,
      origin: { y: 0.66 },
      colors: ["#2ecc71", "#e53935", "#ffffff", "#ffd166", "#ff8fab"],
    });
    window.confetti({
      particleCount: 90,
      spread: 140,
      startVelocity: 26,
      origin: { y: 0.72 },
      colors: ["#2ecc71", "#e53935", "#ffffff"],
    });
    return;
  }

  resizeCanvas();
  confettiParticles = Array.from({ length: 120 }, () => ({
    x: window.innerWidth / 2 + (Math.random() * 160 - 80),
    y: window.innerHeight * 0.62,
    r: 4 + Math.random() * 6,
    vx: (Math.random() - 0.5) * 8,
    vy: -4 - Math.random() * 8,
    rotation: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.22,
    color: ["#2ecc71", "#e53935", "#ffffff", "#ffd166"][Math.floor(Math.random() * 4)],
    life: 90 + Math.random() * 60,
  }));

  if (confettiRAF) {
    cancelAnimationFrame(confettiRAF);
  }
  animateConfetti();
}

function animateConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles = confettiParticles.filter((particle) => particle.life > 0);

  confettiParticles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.22;
    particle.rotation += particle.vr;
    particle.life -= 1;

    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-particle.r, -particle.r * 0.55, particle.r * 2, particle.r * 1.1, 2);
    } else {
      ctx.rect(-particle.r, -particle.r * 0.55, particle.r * 2, particle.r * 1.1);
    }
    ctx.fill();
    ctx.restore();
  });

  if (confettiParticles.length > 0) {
    confettiRAF = requestAnimationFrame(animateConfetti);
  } else {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

function resizeCanvas() {
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  confettiCanvas.width = Math.floor(window.innerWidth * dpr);
  confettiCanvas.height = Math.floor(window.innerHeight * dpr);
  confettiCanvas.style.width = `${window.innerWidth}px`;
  confettiCanvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bindScreen() {
  const start = screen.querySelector("[data-action='start']");
  start?.addEventListener("click", () => {
    playClick();
    renderAnalysis();
  });

  const continueBtn = screen.querySelector("[data-action='continue']");
  continueBtn?.addEventListener("click", () => {
    playClick();
    state.questionIndex = 0;
    renderQuestion(0);
  });

  const rateButtons = screen.querySelectorAll("[data-action='rate']");
  rateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.rating = Number(button.dataset.value || 0);
      playClick();
      renderRating();
    });
  });

  const finish = screen.querySelector("[data-action='finish-session']");
  finish?.addEventListener("click", () => {
    if (!state.rating) return;
    playClick();
    renderClosing();
  });

  const claim = screen.querySelector("[data-action='claim-reward']");
  claim?.addEventListener("click", handleClaimReward);

  const next = screen.querySelector("[data-action='next']");
  next?.addEventListener("click", () => {
    playClick();
    if (!canAdvanceQuestion(state.questionIndex)) return;
    if (state.questionIndex < QUESTION_COUNT - 1) {
      renderQuestion(state.questionIndex + 1);
    } else {
      renderRating();
    }
  });

  const choiceButtons = screen.querySelectorAll("[data-action='choice']");
  choiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      playClick();
      const field = button.dataset.field;
      const value = button.dataset.value || "";
      if (field === "q1") state.q1 = value;
      if (field === "q6") state.q6 = value;
      if (field === "q7") state.q7 = value;
      if (field === "q6") {
        state.q6DevelopOpen = false;
        state.q6DevelopDecision = "";
        state.q6Detail = "";
      }
      renderQuestion(state.questionIndex);
    });
  });

  const toggleDevelop = screen.querySelector("[data-action='toggle-develop']");
  toggleDevelop?.addEventListener("click", () => {
    if (!state.q6) return;
    playClick();
    state.q6DevelopOpen = true;
    renderQuestion(state.questionIndex);
  });

  const developButtons = screen.querySelectorAll("[data-action='develop-choice']");
  developButtons.forEach((button) => {
    button.addEventListener("click", () => {
      playClick();
      state.q6DevelopDecision = button.dataset.value || "";
      if (state.q6DevelopDecision === "Não") {
        state.q6DevelopOpen = false;
        state.q6Detail = "";
        renderQuestion(state.questionIndex + 1);
        return;
      }
      renderQuestion(state.questionIndex);
    });
  });

  const q2 = screen.querySelector("[data-field='q2']");
  q2?.addEventListener("input", (event) => {
    state.q2 = event.target.value;
    setActiveQuestionButtonState();
  });

  const q3 = screen.querySelector("[data-field='q3']");
  q3?.addEventListener("input", (event) => {
    state.q3 = event.target.value;
    setActiveQuestionButtonState();
  });

  const q4 = screen.querySelector("[data-field='q4']");
  q4?.addEventListener("input", (event) => {
    state.q4 = event.target.value;
    setActiveQuestionButtonState();
  });

  const q5 = screen.querySelector("[data-field='q5']");
  q5?.addEventListener("input", (event) => {
    state.q5 = event.target.value;
    setActiveQuestionButtonState();
  });

  const q8 = screen.querySelector("[data-field='q8']");
  q8?.addEventListener("input", (event) => {
    state.q8 = event.target.value;
    setActiveQuestionButtonState();
  });

  const q6Detail = screen.querySelector("[data-field='q6Detail']");
  q6Detail?.addEventListener("input", (event) => {
    state.q6Detail = event.target.value;
    setActiveQuestionButtonState();
  });

  if (screen.querySelector("[data-action='next']")) {
    setActiveQuestionButtonState();
  }
  setRatingButtonState();
}

function handleKeydown(event) {
  if (event.key !== "Enter") return;
  const visibleFinish = screen.querySelector("[data-action='finish-session']");
  if (visibleFinish && !visibleFinish.disabled) {
    visibleFinish.click();
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action || button.dataset.value) {
    event.preventDefault();
  }
});

window.addEventListener("keydown", handleKeydown);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
renderBoot();

