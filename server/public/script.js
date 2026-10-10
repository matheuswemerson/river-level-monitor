// === VARIÁVEIS GLOBAIS ===
let todosLocais = []; 
let notificacoesAtivas = localStorage.getItem("notificacoes_ativas") !== "false"; // Padrão true

// Variáveis de Controle
let ultimoDados = null;
let graficoInfo = null;
let mapaLeaflet = null; 
let currentLocalId = 1; 
let ultimaDataLeitura = null; 

// === INICIALIZAÇÃO DO DOM (OTIMIZADA) ===
document.addEventListener("DOMContentLoaded", () => {
    // Configura checkbox de notificação
    const check = document.getElementById("checkNotificacoes");
    if(check) check.checked = notificacoesAtivas;

    // 1. Feedback visual imediato (Opcional, mas recomendado)
    document.getElementById("local").textContent = "Carregando...";

    // 2. PRÉ-CARREGAMENTO PARALELO (Promise.all)
    // Dispara todas as requisições ao mesmo tempo, sem esperar uma terminar para começar a outra
    Promise.all([
        carregarLocais(),               // Baixa a lista de rios
        atualizarGauge(currentLocalId), // Baixa o nível atual
        carregarHistorico(currentLocalId) // <--- O PULO DO GATO: Baixa o histórico mesmo com a janela fechada
    ]).then(() => {
        console.log("✅ Dados iniciais carregados com sucesso!");
    }).catch(err => {
        console.error("Erro no carregamento inicial:", err);
    });
    
    // Inicia o loop de 5 segundos para manter atualizado
    setInterval(cicloDeAtualizacao, 5000); 
});

// === CONFIGURAÇÃO DO GAUGE (Chart.js) ===
const ctx = document.getElementById('nivelGauge').getContext('2d');
const nivelGauge = new Chart(ctx, {
  type: 'doughnut',
  data: {
    datasets: [{
      data: [0, 100],
      backgroundColor: ['#4caf50', '#ddd'],
      borderWidth: 0
    }]
  },
  options: {
    circumference: 360,
    rotation: 180,
    cutout: '70%',
    plugins: { tooltip: { enabled: false }, legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false
  }
});


// === FUNÇÃO CENTRAL DE ATUALIZAÇÃO (O Cérebro) ===
function cicloDeAtualizacao() {
    // 1. Atualiza o Gauge e Textos Principais (Sempre)
    atualizarGauge(currentLocalId);

    // 2. Atualiza Modais ABERTOS (apenas se necessário)
    
    // Histórico (Calendário)
    if (document.getElementById("historicoSection").style.display === "block") {
        carregarHistorico(currentLocalId);
    }

    // Alertas (Lista)
    if (document.getElementById("alertasSection").style.display === "flex") {
        carregarHistorico(currentLocalId); 
        setTimeout(mostrarAlertasAtuais, 500); 
    }

    // Informações (Gráfico)
    if (document.getElementById("infoSection").style.display === "flex") {
        let dias = 7; 
        if(document.getElementById('btn-30d').classList.contains('active')) dias = 30;
        if(document.getElementById('btn-all').classList.contains('active')) dias = null;
        atualizarGraficoInfo(dias);
    }
    
    // Mapa (Status em tempo real)
    if (document.getElementById("mapSection").style.display === "flex") {
         carregarLocais(); 
         setTimeout(mostrarMapa, 500); 
    }
}

// === FUNÇÃO PARA ATUALIZAR GAUGE ===
function atualizarGauge(localId) {
  fetch(`/api/leituras?local_id=${localId}`)
    .then(response => response.json())
    .then(dados => {
      const registros = dados.leituras || [];
      const maximoDia = dados.maximo || 0;
      const aviso = document.getElementById("avisoGauge");

      if (registros.length === 0) {
        if (aviso) aviso.style.display = "block";
        nivelGauge.data.datasets[0].data = [0, 100];
        nivelGauge.update();
        resetarTextos();
        ultimaDataLeitura = null; 
        return; 
      }

      if (aviso) aviso.style.display = "none";
      const atual = registros[0];
      const nivel = atual.nivel || 0;
      const dataLeituraAtual = new Date(atual.created_at).getTime();

      // --- LÓGICA DE NOTIFICAÇÃO ---
      if (notificacoesAtivas && ultimaDataLeitura && dataLeituraAtual > ultimaDataLeitura) {
          
          let statusTexto = "Nível Seguro";
          let tipoNotificacao = "sucesso";

          if (nivel >= 75) {
              statusTexto = "Risco de Enchente";
              tipoNotificacao = "erro";
          }
          else if (nivel >= 50) {
              statusTexto = "Nível Moderado";
              tipoNotificacao = "aviso";
          }

          mostrarNotificacao(
              "Nova Leitura Recebida", 
              `Nível: ${nivel}% - ${statusTexto}`, 
              tipoNotificacao
          );
          
          // Força atualização da variável global de histórico para os alertas
          carregarHistorico(localId);
      }
      
      ultimaDataLeitura = dataLeituraAtual;

      // --- ATUALIZA VISUAL ---
      let corFundo = "#4caf50"; 
      if (nivel >= 50 && nivel < 75) corFundo = "#ffb300"; 
      else if (nivel >= 75) corFundo = "#e53935"; 
      
      nivelGauge.data.datasets[0].backgroundColor[0] = corFundo;
      nivelGauge.data.datasets[0].data = [nivel, 100 - nivel];
      nivelGauge.update();

      const dataLocal = new Date(atual.created_at);
      document.getElementById("percentDisplay").textContent = nivel + "%";
      document.getElementById("local").textContent = atual.localidade || "--";
      document.getElementById("data").textContent = formatarData(dataLocal);
      document.getElementById("hora").textContent = formatarHora(dataLocal);
      document.getElementById("maximo").textContent = maximoDia + "%";
    })
    .catch(err => console.error("Erro ao carregar gauge:", err));
}

function resetarTextos() {
    document.getElementById("percentDisplay").textContent = "--%";
    document.getElementById("local").textContent = "--";
    document.getElementById("data").textContent = "--/--/----";
    document.getElementById("hora").textContent = "--:--";
    document.getElementById("maximo").textContent = "--%";
}

// === CARREGA HISTÓRICO (Variável Global) ===
function carregarHistorico(localId) {
  fetch(`/api/todas-leituras?local_id=${localId}`)
    .then(response => response.json())
    .then(registros => {
      if (!registros.length) {
        ultimoDados = null;
        if (graficoInfo) {
            graficoInfo.data.labels = [];
            graficoInfo.data.datasets[0].data = [];
            graficoInfo.update();
        }
        return;
      }

      const dadosConvertidos = registros.map(r => {
        const dataObj = new Date(r.created_at); 
        return {
          data: formatarData(dataObj),
          hora: formatarHora(dataObj), 
          nivel: r.nivel,
          local: r.localidade
        };
      });

      ultimoDados = {
        atual: dadosConvertidos[0],
        historico: dadosConvertidos
      };
      
      // Se o gráfico estiver aberto, atualiza ele visualmente também
      if (document.getElementById("infoSection").style.display === "flex") {
         // Não chamamos mostrarInfo() aqui para não recriar o gráfico do zero, 
         // apenas deixamos o cicloDeAtualizacao cuidar dos dados ou chamamos atualizarGraficoInfo direto se necessário.
      }
    })
    .catch(err => console.error("Erro ao carregar histórico:", err));
}

// === CARREGA OS LOCAIS (Array Global) ===
function carregarLocais() {
  fetch("/api/locais")
    .then(response => response.json())
    .then(locais => {
      todosLocais = locais;
    })
    .catch(err => console.error("Erro ao carregar locais:", err));
}

// === FUNÇÃO DE TROCA DE LOCAL ===
function mudarLocalAtivo(localId) {
  currentLocalId = localId;
  
  // Reseta estado para evitar notificação falsa ao trocar de local
  ultimaDataLeitura = null; 
  
  // Atualiza Imediatamente
  atualizarGauge(currentLocalId);
  carregarHistorico(currentLocalId);
  
  // Fecha modais para limpar a tela
  fecharHistorico(true);
  fecharAlertas(true);
  fecharInfo(true);
  fecharLocais(true);
}


// === FORMATADORES ===
function formatarData(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function formatarHora(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// === HISTÓRICO (CALENDÁRIO) ===
function mostrarHistorico() {
  const historicoSection = document.getElementById("historicoSection");
  const lista = document.getElementById("historicoList");
  
  historicoSection.style.display = "block"; // Abre o modal

  // 1. Carregando...
  if (!ultimoDados) {
    lista.innerHTML = "<li style='text-align:center; padding:20px;'><div class='loader'></div> Carregando histórico...</li>";
    carregarHistorico(currentLocalId).then(() => {
        if(!ultimoDados) lista.innerHTML = "<li>Nenhum histórico disponível.</li>";
        else mostrarHistorico(); 
    });
    return;
  }

  // 2. Sem dados
  if (!Array.isArray(ultimoDados.historico) || ultimoDados.historico.length === 0) {
    lista.innerHTML = "<li>Nenhum histórico disponível para este local.</li>";
    return;
  }

  // --- CORREÇÃO AQUI ---
  // Limpa qualquer calendário antigo antes de criar um novo
  lista.innerHTML = ""; 
  // ---------------------

  // --- Lógica do Calendário ---
  const calendarContainer = document.createElement("div");
  calendarContainer.className = "calendar-container";
  
  const header = document.createElement("div");
  header.className = "calendar-header";
  
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "<";
  const nextBtn = document.createElement("button");
  nextBtn.textContent = ">";
  const monthLabel = document.createElement("span");
  monthLabel.style.fontWeight = "bold";
  
  header.appendChild(prevBtn);
  header.appendChild(monthLabel);
  header.appendChild(nextBtn);
  calendarContainer.appendChild(header);
  
  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  calendarContainer.appendChild(grid);
  
  const registroDiv = document.createElement("div");
  registroDiv.id = "registroDoDia";
  calendarContainer.appendChild(registroDiv);
  
  lista.appendChild(calendarContainer);

  const historicoNormalizado = ultimoDados.historico.map(h => {
    const [dia, mes, ano] = h.data.split("/");
    // Ajuste seguro de data
    const dataObj = new Date(ano, mes - 1, dia);
    return { ...h, dataObj };
  });

  let currentDate = new Date();

  function renderCalendar(year, month) {
    grid.innerHTML = "";
    const primeiroDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    
    monthLabel.textContent = `${nomesMeses[month]} ${year}`;
    const startDay = primeiroDia.getDay(); // 0 = Domingo
    
    for (let i = 0; i < startDay; i++) {
      grid.appendChild(document.createElement("div"));
    }
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dayEl = document.createElement("div");
      dayEl.className = "calendar-day";
      dayEl.textContent = dia;
      
      const dataLoop = new Date(year, month, dia);
      const registrosDia = historicoNormalizado.filter(h =>
        h.dataObj.getFullYear() === dataLoop.getFullYear() &&
        h.dataObj.getMonth() === dataLoop.getMonth() &&
        h.dataObj.getDate() === dataLoop.getDate()
      );

      if (registrosDia.length > 0) {
        // Pega o pior nível do dia
        const max = registrosDia.reduce((a, b) => (b.nivel > a.nivel ? b : a));
        const nivelMaximo = max.nivel;
        
        let corFundo = "";
        if (nivelMaximo < 50) corFundo = "#4caf50";
        else if (nivelMaximo < 75) corFundo = "#ffb300"; 
        else corFundo = "#e53935";
        
        dayEl.style.backgroundColor = corFundo;
        dayEl.style.color = "white";
        dayEl.style.fontWeight = "bold";
        dayEl.classList.add("has-data");

        dayEl.addEventListener("click", () => {
          let alertaStatus = "";
          let alertaCor = "";
          if (nivelMaximo < 50) {
              alertaStatus = "Seguro";
              alertaCor = "#4caf50";
          } else if (nivelMaximo < 75) { 
              alertaStatus = "Moderado";
              alertaCor = "#ffb300";
          } else {
              alertaStatus = "Risco de Enchente";
              alertaCor = "#e53935";
          }
          
          const dataStr = `${String(dia).padStart(2,"0")}/${String(month + 1).padStart(2,"0")}/${year}`;
          registroDiv.innerHTML = `
            <div class="registro-detalhe">
                <h4>${dataStr}</h4>
                <p><strong>Local:</strong> ${max.local}</p>
                <p><strong>Nível Máximo:</strong> ${nivelMaximo}%</p>
                <p><strong>Status:</strong> <span style="color:${alertaCor}; font-weight:bold;">${alertaStatus}</span></p>
                <p><strong>Hora do Máximo:</strong> ${max.hora}</p>
            </div>
          `;
        });
      }

      const hoje = new Date();
      if (dataLoop.setHours(0,0,0,0) == hoje.setHours(0,0,0,0)) {
        dayEl.style.border = "2px solid #6379A7";
      }
      grid.appendChild(dayEl);
    }
  }

  prevBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    registroDiv.innerHTML = "";
  });
  nextBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    registroDiv.innerHTML = "";
  });

  renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

function fecharHistorico(limpando = false) {
  if (!limpando) document.getElementById("historicoSection").style.display = "none";
}

// === GRÁFICO DE INFORMAÇÕES ===
function mostrarInfo() {
  const infoSection = document.getElementById("infoSection");
  infoSection.style.display = "flex";
  
  if (!graficoInfo) {
    const ctxInfo = document.getElementById("graficoInfo").getContext("2d");
    graficoInfo = new Chart(ctxInfo, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Nível (%)", data: [],
          borderColor: "#282C55", backgroundColor: "rgba(40, 44, 85, 0.2)",
          tension: 0.3, pointRadius: 5, pointHoverRadius: 7, fill: true,
        }]
      },
      options: { 
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { font: { size: 14 }}},
          title: { display: true, text: 'Histórico Completo de Níveis', font: { size: 18 }},
          tooltip: { enabled: true }
        },
        scales: {
          x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 45, font: { size: 12 }}},
          y: { beginAtZero: true, max: 100, ticks: { font: { size: 12 }}}
        }
      }
    });
  }
  
  atualizarGraficoInfo(7); // Padrão 7 dias
}

async function atualizarGraficoInfo(dias) {
  document.querySelectorAll('.filtro-btn').forEach(btn => btn.classList.remove('active'));
  
  if (dias === 7) document.getElementById('btn-7d').classList.add('active');
  else if (dias === 30) document.getElementById('btn-30d').classList.add('active');
  else document.getElementById('btn-all').classList.add('active');

  let url = `/api/todas-leituras?local_id=${currentLocalId}`;
  if (dias) {
    url += `&dias=${dias}`;
  }
  
  try {
    const response = await fetch(url);
    const registros = await response.json();
    
    let labels = [];
    let niveis = [];

    if (registros && registros.length > 0) {
      registros.reverse(); 
      labels = registros.map(r => `${formatarData(new Date(r.created_at))} ${formatarHora(new Date(r.created_at))}`);
      niveis = registros.map(r => r.nivel);
    }

    if(graficoInfo) {
        graficoInfo.data.labels = labels;
        graficoInfo.data.datasets[0].data = niveis;
        graficoInfo.update();
    }
  } catch (err) {
    console.error("Erro ao atualizar gráfico:", err);
  }
}

function fecharInfo(limpando = false) {
  if (!limpando) document.getElementById("infoSection").style.display = "none";
}

// === ALERTAS ===
function mostrarAlertasAtuais() {
  const alertasSection = document.getElementById("alertasSection");
  const lista = document.getElementById("listaAlertas");
  
  alertasSection.style.display = "flex"; // Abre o modal

  // Estado de Carregamento
  if (!ultimoDados) {
    lista.innerHTML = "<li style='text-align:center; padding:20px;'>Carregando alertas...</li>";
    // Tenta buscar se não tiver
    carregarHistorico(currentLocalId).then(() => {
         mostrarAlertasAtuais(); // Tenta renderizar de novo
    });
    return;
  }
  
  const registrosEmAlerta = ultimoDados.historico.filter(r => r.nivel >= 50);

  if (registrosEmAlerta.length === 0) {
    lista.innerHTML = "<li>Nenhum alerta (nível >= 50%) registrado para este local.</li>";
    alertasSection.style.display = "flex";
    return;
  }
  
  registrosEmAlerta.forEach(r => {
    const n = r.nivel;
    let nivelAlerta = "";
    let classeAlerta = ""; 
    
    if (n < 75) { 
      nivelAlerta = "Nível Moderado";
      classeAlerta = "alerta-moderado";
    } else {
      nivelAlerta = "Risco de Enchente";
      classeAlerta = "alerta-risco";
    }

    const item = document.createElement("li");
    item.className = `alerta-item ${classeAlerta}`; 
    item.innerHTML = `
      <div class="alerta-icona">
        <span>!</span>
      </div>
      <div class="alerta-info">
        <span class="alerta-local">${r.local}</span>
        <span class="alerta-status">${nivelAlerta} (${n}%)</span>
        <span class="alerta-tempo">Coleta: ${r.data} às ${r.hora}</span>
      </div>
    `;
    lista.appendChild(item);
  });
  alertasSection.style.display = "flex"; 
}

function fecharAlertas(limpando = false) {
  if (!limpando) document.getElementById("alertasSection").style.display = "none";
}

// === LISTA DE LOCAIS ===
function mostrarLocais() {
  const locaisSection = document.getElementById("locaisSection");
  const lista = document.getElementById("listaLocais");
  lista.innerHTML = ""; 
  
  if (!todosLocais || todosLocais.length === 0) {
    lista.innerHTML = "<li>Nenhum local cadastrado.</li>";
  } else {
      todosLocais.forEach(local => {
        const item = document.createElement("li");
        item.className = "local-item"; 
        
        let infoExtraHTML = "";
        if (local.totalRegistros > 0) {
          infoExtraHTML = `
            <span class="local-sub">Último nível: <strong>${local.ultimoNivel}%</strong></span>
            <span class="local-sub-total">(${local.totalRegistros} registros)</span>
          `;
        } else {
          infoExtraHTML = `<span class="local-sub-aviso">Nenhum registro encontrado</span>`;
        }

        item.innerHTML = `
          <div class="local-icona">
            <img src="./img/rio.png" alt="Icone Rio">
          </div>
          <div class="local-info">
            <span class="local-nome">${local.nome}</span>
            ${infoExtraHTML}
          </div>
          <div class="local-detalhes">
            <p>${local.descricao || "Nenhuma descrição disponível."}</p>
            <p><strong>Coordenadas:</strong><br>${local.latitude}, ${local.longitude}</p>
            ${local.totalRegistros > 0 ? 
              `<p><strong>Última Leitura:</strong><br>${formatarData(new Date(local.dataUltimoNivel))} às ${formatarHora(new Date(local.dataUltimoNivel))}</p>` 
              : ''
            }
            <button class="popup-select-btn">Acessar Dashboard</button>
          </div>
        `;

        // Listeners
        const selectBtn = item.querySelector('.popup-select-btn');
        const localInfo = item.querySelector('.local-info');
        const localIcon = item.querySelector('.local-icona');

        const toggleExpand = () => item.classList.toggle("expandido");
        localIcon.addEventListener("click", toggleExpand);
        localInfo.addEventListener("click", toggleExpand);
        
        selectBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          mudarLocalAtivo(local.id);
          fecharLocais();
        });

        lista.appendChild(item);
      });
  }
  
  locaisSection.style.display = "flex";
}

function fecharLocais(limpando = false) {
  if (!limpando) document.getElementById("locaisSection").style.display = "none";
}

// === MAPA ===
function mostrarMapa() {
  const mapSection = document.getElementById("mapSection");
  mapSection.style.display = "flex";

  if (!mapaLeaflet) {
    // Tenta centrar no local atual se tiver coords, senão Recife
    const localAtual = todosLocais.find(l => l.id == currentLocalId);
    const lat = localAtual ? localAtual.latitude : -8.13965;
    const lon = localAtual ? localAtual.longitude : -34.9464;
    
    mapaLeaflet = L.map('mapContainer').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapaLeaflet);
  }

  // Limpa marcadores
  mapaLeaflet.eachLayer((layer) => {
    if (layer instanceof L.Marker) mapaLeaflet.removeLayer(layer);
  });

  todosLocais.forEach(local => {
    if (local.latitude && local.longitude) {
      
      let statusTexto = "Seguro";
      let statusCor = "#4caf50";
      
      if (local.ultimoNivel >= 75) {
          statusTexto = "Risco";
          statusCor = "#e53935";
      } else if (local.ultimoNivel >= 50) {
          statusTexto = "Moderado";
          statusCor = "#ffb300";
      }

      let infoMedicao = `<p><i>Sem registros de medição.</i></p>`;
      if (local.totalRegistros > 0) {
          const dataLeitura = new Date(local.dataUltimoNivel);
          infoMedicao = `
              <p><strong>Medição Atual:</strong> ${local.ultimoNivel}%</p>
              <p><strong>Status:</strong> <span style="font-weight:bold; color:${statusCor};">${statusTexto}</span></p>
              <p><strong>Última Leitura:</strong> ${formatarData(dataLeitura)} às ${formatarHora(dataLeitura)}</p>
          `;
      }
      
      // Conteúdo Base
      let popupContent = `
          <div class="custom-popup">
              <h3>${local.nome}</h3>
              ${infoMedicao}
          </div>
      `;

      const marker = L.marker([local.latitude, local.longitude]).addTo(mapaLeaflet);

      if (L.Browser.touch) {
          // Mobile: Botão dentro do popup
          popupContent += `
              <div class="custom-popup">
                  <button class="popup-select-btn" onclick="selecionarLocalDoMapa(${local.id})">
                    Ver Dashboard
                  </button>
              </div>`;
          marker.bindPopup(popupContent);
      } else {
          // Desktop: Hover e Click direto
          marker.bindPopup(popupContent);
          marker.on('mouseover', function () { this.openPopup(); });
          marker.on('mouseout', function () { this.closePopup(); });
          marker.on('click', () => {
              mudarLocalAtivo(local.id);
              fecharMapa();
          });
      }
    }
  });

  setTimeout(() => { mapaLeaflet.invalidateSize(); }, 100);
}

function fecharMapa() {
  document.getElementById("mapSection").style.display = "none";
}

function selecionarLocalDoMapa(localId) {
  mudarLocalAtivo(localId);
  fecharMapa();
}


// === MODAIS NOVOS (Rio e Config) ===

function abrirRioInfo() {
    const localAtual = todosLocais.find(l => l.id == currentLocalId);
    
    if (localAtual) {
        document.getElementById("rioInfoNome").textContent = localAtual.nome;
        document.getElementById("rioInfoDesc").textContent = localAtual.descricao || "Sem descrição.";
        document.getElementById("rioInfoRec").textContent = localAtual.nivel_recomendado || "--";
        document.getElementById("rioInfoHist").textContent = localAtual.altura_maxima_historica || "Não registrado";
        document.getElementById("rioInfoDetalhe").textContent = localAtual.info_detalhada || "Nenhuma informação adicional.";
    } else {
        document.getElementById("rioInfoNome").textContent = "Local não selecionado";
    }

    document.getElementById("rioInfoModal").style.display = "block";
}

function fecharRioInfo() {
    document.getElementById("rioInfoModal").style.display = "none";
}

function abrirConfig() {
    document.getElementById("configModal").style.display = "block";
}
function fecharConfig() {
    document.getElementById("configModal").style.display = "none";
}

function toggleNotificacoes() {
    const check = document.getElementById("checkNotificacoes");
    notificacoesAtivas = check.checked;
    localStorage.setItem("notificacoes_ativas", notificacoesAtivas);
    
    if(notificacoesAtivas) mostrarNotificacao("Ativado", "Você receberá alertas de novas medições.", "sucesso");
    else mostrarNotificacao("Desativado", "Alertas de medição silenciados.", "aviso");
}